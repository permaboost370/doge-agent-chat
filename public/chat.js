const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");

// --- generate / remember username per subdomain ---
function getUsernameForHost() {
  const host = window.location.host;
  const key = `dogeUsername_${host}`;
  let username = localStorage.getItem(key);
  if (!username) {
    const rand = Math.floor(Math.random() * 900) + 100; // 100-999
    username = `muchdogeagent${rand}`;
    localStorage.setItem(key, username);
  }
  return username;
}

const username = getUsernameForHost();
const room = window.location.host;

// --- socket.io connection ---
const socket = io();

// join the room once connected
socket.on("connect", () => {
  socket.emit("joinRoom", { room, username });
});

// typewriter function
function typeWriter(element, text, speed = 15, onComplete) {
  let i = 0;
  element.classList.add("typing");

  const interval = setInterval(() => {
    element.textContent += text[i];
    i += 1;
    messages.scrollTop = messages.scrollHeight;

    if (i >= text.length) {
      clearInterval(interval);
      element.classList.remove("typing");
      if (typeof onComplete === "function") onComplete();
    }
  }, speed);
}

// intro
const introText =
  `C:\\DOGEOS\\LOBBY> SUBDOMAIN ROOM: ${room}\n` +
  `> ASSIGNED CODENAME: ${username}\n` +
  `> ALL TRANSMISSIONS ARE PUBLIC IN THIS ROOM.\n` +
  `> TYPE TO BROADCAST TO OTHER AGENTS.\n`;

function playIntro() {
  const div = document.createElement("div");
  div.className = "msg system typing";
  messages.appendChild(div);
  typeWriter(div, introText, 20);
}

playIntro();

// render messages in box style
function addBoxedMessage(text, who = "user", label = "") {
  const div = document.createElement("div");
  div.className = "msg " + who;
  messages.appendChild(div);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const prefix = label ? `${label}> ` : "";
  const labeledLines = lines.map((l) => prefix + l);

  const maxLen = labeledLines.reduce(
    (max, line) => Math.max(max, line.length),
    0
  );
  const border = "+" + "-".repeat(maxLen + 2) + "+";

  const boxedText =
    border +
    "\n" +
    labeledLines
      .map((line) => {
        const padding = " ".repeat(maxLen - line.length);
        return "| " + line + padding + " |";
      })
      .join("\n") +
    "\n" +
    border;

  typeWriter(div, boxedText, 10);
  messages.scrollTop = messages.scrollHeight;
}

// system messages (join/leave notices)
socket.on("systemMessage", ({ text }) => {
  addBoxedMessage(text, "system", "SYS");
});

// incoming chat messages from any user
socket.on("chatMessage", ({ username: fromUser, text, timestamp }) => {
  if (fromUser === username) {
    // my own message as "YOU"
    addBoxedMessage(text, "user", "YOU");
  } else {
    // other agents styled as bot (green) with their codename
    addBoxedMessage(text, "bot", fromUser);
  }
});

// sending messages
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  socket.emit("chatMessage", { text });
  input.value = "";
});
