// server.mjs
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- HTTP server + Socket.IO ----------
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
  // Make disconnects less aggressive when tab is backgrounded / mobile sleeps
  pingTimeout: 60000,   // 60s to consider the client dead
  pingInterval: 25000,  // send pings every 25s
});

// ---------- OpenAI (for Agent Doge) ----------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const DOGE_SYSTEM_PROMPT = `
You are Agent Doge, a black-and-white pixel Doge secret agent.
You speak in short, punchy lines (1–2 sentences).
You are minimal, wholesome, slightly chaotic, but never toxic or NSFW.
Use Doge meme language sometimes: "such intel", "very stealth", "much wow".
You are chatting in a public lobby with multiple human agents.
You never use emojis or emoticons. Only plain ASCII text.
`;

// ---------- ElevenLabs TTS (optional, for Agent Doge voice) ----------
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || null;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || null;
const ELEVENLABS_MODEL_ID =
  process.env.ELEVENLABS_MODEL_ID || "eleven_turbo_v2";

function getEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function synthesizeWithElevenLabs(text) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return null; // TTS not configured
  }

  const stability = getEnvNumber("ELEVENLABS_STABILITY", 0.75);
  const similarity = getEnvNumber("ELEVENLABS_SIMILARITY", 1.0);
  const style = getEnvNumber("ELEVENLABS_STYLE", 0.15);
  const speakerBoostEnv = process.env.ELEVENLABS_SPEAKER_BOOST;
  const useSpeakerBoost =
    speakerBoostEnv === undefined
      ? true
      : speakerBoostEnv.toLowerCase() !== "false";

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const payload = {
    text,
    model_id: ELEVENLABS_MODEL_ID,
    voice_settings: {
      stability,
      similarity_boost: similarity,
      style,
      use_speaker_boost: useSpeakerBoost
    }
  };

  console.log(
    `[TTS] ElevenLabs voice_id=${ELEVENLABS_VOICE_ID}, model_id=${ELEVENLABS_MODEL_ID}, ` +
      `stability=${stability}, similarity=${similarity}, style=${style}, speaker_boost=${useSpeakerBoost}`
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      "ElevenLabs error:",
      response.status,
      response.statusText,
      errorText
    );
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

// ---------- Room user / mute / ban / history tracking ----------
/**
 * roomUsers:   Map<room, Map<socketId, username>>
 * roomMutes:   Map<room, Set<socketId>>
 * roomBans:    Map<room, Set<username>>
 * roomHistory: Map<room, Array<{kind, username, text, timestamp}>>
 */
const roomUsers = new Map();
const roomMutes = new Map();
const roomBans = new Map();
const roomHistory = new Map();
const MAX_HISTORY_PER_ROOM = 200;

function getRoomSet(map, room) {
  let set = map.get(room);
  if (!set) {
    set = new Set();
    map.set(room, set);
  }
  return set;
}

function addHistory(room, entry) {
  let list = roomHistory.get(room);
  if (!list) {
    list = [];
    roomHistory.set(room, list);
  }
  list.push(entry);
  if (list.length > MAX_HISTORY_PER_ROOM) {
    list.shift();
  }
}

function updateRoomUsers(room) {
  const usersMap = roomUsers.get(room) || new Map();
  const users = Array.from(usersMap.values());
  io.to(room).emit("roomUsers", {
    users,
    count: users.length
  });
}

// helper to broadcast a system message + store in history
function emitSystem(room, text) {
  const ts = Date.now();
  io.to(room).emit("systemMessage", { text });
  addHistory(room, {
    kind: "system",
    username: null,
    text,
    timestamp: ts
  });
}

// ---------- Admin config ----------
const ADMIN_SECRET = process.env.ADMIN_SECRET || null;

// ---------- Socket.IO events ----------
io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  socket.on("joinRoom", ({ room, username }) => {
    // Check ban list first
    const bans = roomBans.get(room);
    if (bans && bans.has(username)) {
      socket.emit("systemMessage", {
        text: "Access denied. You are banned from this room."
      });
      socket.disconnect(true);
      return;
    }

    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;
    socket.data.isAdmin = false;

    if (!roomUsers.has(room)) {
      roomUsers.set(room, new Map());
    }
    roomUsers.get(room).set(socket.id, username);

    console.log(`Socket ${socket.id} joined room=${room} as ${username}`);

    // send history to this user only
    const history = roomHistory.get(room) || [];
    socket.emit("history", { entries: history });

    // no join system message
    updateRoomUsers(room);
  });

  // Admin login: /admin password
  socket.on("adminLogin", ({ password }) => {
    if (!ADMIN_SECRET) {
      socket.emit("adminStatus", {
        ok: false,
        message: "Admin mode not configured."
      });
      return;
    }

    if (password === ADMIN_SECRET) {
      socket.data.isAdmin = true;
      socket.emit("adminStatus", {
        ok: true,
        message: "Admin privileges granted."
      });
    } else {
      socket.emit("adminStatus", {
        ok: false,
        message: "Invalid admin code."
      });
    }
  });

  // Admin actions: mute / unmute / ban / clearHistory
  socket.on("adminCommand", ({ action, target }) => {
    const room = socket.data.room;
    if (!room || !socket.data.isAdmin) {
      socket.emit("systemMessage", {
        text: "Admin command rejected. Access not granted."
      });
      return;
    }

    const targetName = (target || "").trim();
    const usersMap = roomUsers.get(room) || new Map();

    switch (action) {
      case "mute": {
        if (!targetName) return;
        const mutes = getRoomSet(roomMutes, room);
        for (const [sid, uname] of usersMap.entries()) {
          if (uname === targetName) {
            mutes.add(sid);
            const s = io.sockets.sockets.get(sid);
            if (s) {
              s.emit("systemMessage", {
                text: "You have been muted by command."
              });
            }
          }
        }
        emitSystem(room, `${targetName} has been muted by command.`);
        break;
      }
      case "unmute": {
        if (!targetName) return;
        const mutes = roomMutes.get(room);
        if (mutes) {
          for (const [sid, uname] of usersMap.entries()) {
            if (uname === targetName) {
              mutes.delete(sid);
              const s = io.sockets.sockets.get(sid);
              if (s) {
                s.emit("systemMessage", {
                  text: "You have been unmuted by command."
                });
              }
            }
          }
        }
        emitSystem(room, `${targetName} has been unmuted.`);
        break;
      }
      case "ban": {
        if (!targetName) return;
        const bans = getRoomSet(roomBans, room);
        bans.add(targetName);

        for (const [sid, uname] of usersMap.entries()) {
          if (uname === targetName) {
            const s = io.sockets.sockets.get(sid);
            if (s) {
              s.emit("systemMessage", {
                text: "You have been banned from this room."
              });
              s.disconnect(true);
            }
          }
        }

        emitSystem(room, `${targetName} has been banned from this room.`);
        break;
      }
      case "clearHistory": {
        // clear server history and tell clients to wipe screen
        roomHistory.set(room, []);
        io.to(room).emit("clearHistory");
        emitSystem(room, "History cleared by command.");
        break;
      }
      default: {
        socket.emit("systemMessage", {
          text: "Unknown admin action."
        });
        break;
      }
    }
  });

  // Change nickname: /nick newname
  socket.on("changeNick", ({ newName }) => {
    const room = socket.data.room;
    const oldName = socket.data.username;
    if (!room || !oldName) return;

    const trimmed = (newName || "").trim();
    if (!trimmed) return;

    const safe = trimmed.replace(/\s+/g, "_").slice(0, 24);

    socket.data.username = safe;

    const usersMap = roomUsers.get(room);
    if (usersMap) {
      usersMap.set(socket.id, safe);
    }

    emitSystem(room, `${oldName} is now known as ${safe}.`);
    updateRoomUsers(room);
  });

  // Normal chat messages (check mute) + store history
  socket.on("chatMessage", ({ text }) => {
    const room = socket.data.room;
    const username = socket.data.username || "unknown";

    if (!room || !text?.trim()) return;

    const mutes = roomMutes.get(room);
    if (mutes && mutes.has(socket.id)) {
      socket.emit("systemMessage", {
        text: "You are muted. Your transmissions are blocked by command."
      });
      return;
    }

    const payload = {
      username,
      text: text.trim(),
      timestamp: Date.now()
    };

    io.to(room).emit("chatMessage", payload);
    addHistory(room, {
      kind: "chat",
      username,
      text: payload.text,
      timestamp: payload.timestamp
    });
  });

  // Agent Doge request: /agent question
  socket.on("agentRequest", async ({ question }) => {
    const room = socket.data.room;
    const fromUser = socket.data.username || "UnknownAgent";

    if (!room || !question?.trim()) return;

    if (!process.env.OPENAI_API_KEY) {
      socket.emit("systemMessage", {
        text: "DogeAgent067 offline: OPENAI_API_KEY not configured."
      });
      return;
    }

    const q = question.trim().slice(0, 500);

    try {
      const messages = [
        { role: "system", content: DOGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `User codename: ${fromUser}\nQuestion: ${q}`
        }
      ];

      const completion = await openai.chat.completions.create({
        model: CHAT_MODEL,
        messages,
        temperature: 0.9,
        max_tokens: 200
      });

      const reply =
        completion.choices?.[0]?.message?.content?.trim() ||
        "such silence, much empty";

      let audioBase64 = null;
      let audioFormat = "mp3";
      try {
        audioBase64 = await synthesizeWithElevenLabs(reply);
      } catch (err) {
        console.error("Agent TTS error:", err);
      }

      const ts = Date.now();

      io.to(room).emit("agentMessage", {
        username: "DogeAgent067",
        text: reply,
        audioBase64,
        audioFormat
      });

      addHistory(room, {
        kind: "agent",
        username: "DogeAgent067",
        text: reply,
        timestamp: ts
      });
    } catch (err) {
      console.error("Agent Doge error:", err);
      socket.emit("systemMessage", {
        text: "DogeAgent067 failed to respond. Mission glitch."
      });
    }
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    const username = socket.data.username;

    if (room && roomUsers.has(room)) {
      const usersMap = roomUsers.get(room);
      usersMap.delete(socket.id);
      if (usersMap.size === 0) {
        roomUsers.delete(room);
      } else {
        updateRoomUsers(room);
      }
    }

    // no leave system message
    console.log("Client disconnected", socket.id);
  });
});

// ---------- Frontend ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Doge Multi-Chat listening on port ${PORT}`);
});
