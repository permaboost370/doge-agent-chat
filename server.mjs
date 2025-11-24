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

io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  // client will tell us which room (subdomain) + username
  socket.on("joinRoom", ({ room, username }) => {
    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;
    console.log(`Socket ${socket.id} joined room=${room} as ${username}`);

    socket.to(room).emit("systemMessage", {
      text: `${username} has joined the mission.`
    });
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

    // broadcast to everyone in the room (including sender)
    io.to(room).emit("chatMessage", payload);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    const username = socket.data.username;
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
