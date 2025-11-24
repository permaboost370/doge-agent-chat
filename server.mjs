// server.mjs
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- HTTP server + Socket.IO ----------
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" }
});

// room -> Map(socketId -> username)
const roomUsers = new Map();

function updateRoomUsers(room) {
  const usersMap = roomUsers.get(room) || new Map();
  const users = Array.from(usersMap.values());
  io.to(room).emit("roomUsers", {
    users,
    count: users.length
  });
}

io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  socket.on("joinRoom", ({ room, username }) => {
    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;

    if (!roomUsers.has(room)) {
      roomUsers.set(room, new Map());
    }
    roomUsers.get(room).set(socket.id, username);

    console.log(`Socket ${socket.id} joined room=${room} as ${username}`);

    socket.to(room).emit("systemMessage", {
      text: `${username} has joined the mission.`
    });

    updateRoomUsers(room);
  });

  socket.on("chatMessage", ({ text }) => {
    const room = socket.data.room;
    const username = socket.data.username || "unknown";

    if (!room || !text?.trim()) return;

    const payload = {
      username,
      text: text.trim(),
      timestamp: Date.now()
    };

    io.to(room).emit("chatMessage", payload);
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

    if (room && username) {
      socket.to(room).emit("systemMessage", {
        text: `${username} has left the mission.`
      });
    }

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
