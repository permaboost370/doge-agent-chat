const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const userListEl = document.getElementById("user-list");
const userCountEl = document.getElementById("user-count");

const codenameSetup = document.getElementById("codename-setup");
const codenameForm = document.getElementById("codename-form");
const codenameInput = document.getElementById("codename-input");

let isAdmin = false;

// --- get stored username per host (no random fallback) ---
function getStoredUsername() {
  const host = window.location.host;
  const key = `dogeUsername_${host}`;
  const value = localStorage.getItem(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

let username = getStoredUsername();
const room = window.location.host;

if (username) {
  // already known user
  if (codenameSetup) codenameSetup.style.display = "none";
  input.disabled = false;
  input.placeholder = "type your transmission...";
} else {
  // new user must set codename
  if (codenameSetup) codenameSetup.style.display = "block";
  input.disabled = true;
  input.placeholder = "set codename above to start...";
}

// --- socket.io connection ---
const socket = io();
let socketConnected = false;
let hasJoined = false;

function tryJoin() {
  if (socketConnected && username && !hasJoined) {
    hasJoined = true;
    socket.emit("joinRoom", { room, username });
    playIntro();
  }
}

socket.on("connect", () => {
  socketConnected = true;
  tryJoin();
});

// plain text typewriter (intro)
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

// HTML typewriter (boxed messages + links)
function typeWriterHTML(element, html, speed = 10, onComplete) {
  let i = 0;
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const fullHTML = tempDiv.innerHTML;

  const interval = setInterval(() => {
    element.innerHTML =
      fullHTML.slice(0, i) + "<span class='cursor'>|</span>";
    i++;
    messages.scrollTop = messages.scrollHeight;

    if (i >= fullHTML.length) {
      clearInterval(interval);
      element.innerHTML = fullHTML; // final render
      if (typeof onComplete === "function") onComplete();
    }
  }, speed);
}

// intro text BUILT USING CURRENT USERNAME
function playIntro() {
  const introText =
    `C:\\DOGEOS\\LOBBY>\n` +
    `> ASSIGNED CODENAME: ${username}\n` +
    `> ALL TRANSMISSIONS ARE PUBLIC IN THIS ROOM.\n` +
    `> TYPE TO BROADCAST TO OTHER AGENTS.\n`;

  const div = document.createElement("div");
  div.className = "msg system typing";
  messages.appendChild(div);
  typeWriter(div, introText, 20);
}

// AUDIO HELPERS for Agent Doge voice
function base64ToBlob(base64, mimeType) {
  if (!base64) return null;
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

function playReplyAudio(base64, format = "mp3") {
  if (!base64) return;

  const mime = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
  const blob = base64ToBlob(base64, mime);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  audio.play().catch((err) => {
    console.warn("Agent audio autoplay blocked or failed:", err);
  });
}

// --- helper: word-wrap text into lines of max width ---
function wrapTextLines(text, maxWidth) {
  const rawLines = text.split("\n");
  const wrapped = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const words = line.split(/\s+/);
    let current = "";

    for (const word of words) {
      if (!current.length) {
        current = word;
      } else if ((current + " " + word).length <= maxWidth) {
        current += " " + word;
      } else {
        wrapped.push(current);
        current = word;
      }
    }

    if (current.length) {
      wrapped.push(current);
    }
  }

  return wrapped;
}

// render messages in box style with clickable links
function addBoxedMessage(text, who = "user", label = "") {
  const div = document.createElement("div");
  div.className = "msg " + who;
  messages.appendChild(div);

  const MAX_CONTENT_WIDTH = 70;
  const lines = wrapTextLines(text, MAX_CONTENT_WIDTH);

  const prefix = label ? `${label}> ` : "";
  const labeledLines = lines.map((l) => prefix + l);

  const maxLen = labeledLines.reduce(
    (max, line) => Math.max(max, line.length),
    0
  );
  const border = "+" + "-".repeat(maxLen + 2) + "+";

  let boxedHTML =
    border +
    "<br>" +
    labeledLines
      .map((line) => {
        const padding = " ".repeat(maxLen - line.length);
        return "| " + line + padding + " |";
      })
      .join("<br>") +
    "<br>" +
    border;

  // clickable URLs
  boxedHTML = boxedHTML.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" class="chat-link">$1</a>'
  );

  typeWriterHTML(div, boxedHTML, 5);
  messages.scrollTop = messages.scrollHeight;
}

// ---- sidebar updates ----
socket.on("roomUsers", ({ users, count }) => {
  if (userCountEl) {
    userCountEl.textContent = count.toString();
  }
  if (!userListEl) return;

  userListEl.innerHTML = "";

  users.forEach((u) => {
    const li = document.createElement("li");
    li.textContent = u === username ? `${u} (you)` : u;
    if (u === username) {
      li.classList.add("user-me");
    }
    userListEl.appendChild(li);
  });
});

// ---- history replay from server ----
socket.on("history", ({ entries }) => {
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    const kind = entry.kind;
    const fromUser = entry.username;
    const text = entry.text || "";

    if (!text.trim()) continue;

    if (kind === "chat") {
      if (fromUser === username) {
        addBoxedMessage(text, "user", "YOU");
      } else {
        addBoxedMessage(text, "bot", fromUser || "Agent");
      }
    } else if (kind === "system") {
      addBoxedMessage(text, "system", "SYS");
    } else if (kind === "agent") {
      addBoxedMessage(text, "bot", fromUser || "DogeAgent067");
    }
  }
});

// clear history event from server (admin /clearall)
socket.on("clearHistory", () => {
  messages.innerHTML = "";
});

// admin login status
socket.on("adminStatus", ({ ok, message }) => {
  if (ok) {
    isAdmin = true;
  }
  addBoxedMessage(message || "Admin status changed.", "system", "SYS");
});

// system messages
socket.on("systemMessage", ({ text }) => {
  addBoxedMessage(text, "system", "SYS");
});

// incoming chat messages from humans
socket.on("chatMessage", ({ username: fromUser, text, timestamp }) => {
  if (fromUser === username) {
    addBoxedMessage(text, "user", "YOU");
  } else {
    addBoxedMessage(text, "bot", fromUser);
  }
});

// Agent Doge messages
socket.on(
  "agentMessage",
  ({ username: agentName, text, audioBase64, audioFormat }) => {
    addBoxedMessage(text, "bot", agentName || "DogeAgent067");
    if (audioBase64) {
      playReplyAudio(audioBase64, audioFormat || "mp3");
    }
  }
);

// ---- codename form logic ----
if (codenameForm) {
  codenameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let val = (codenameInput.value || "").trim();
    if (!val) return;

    let safe = val.replace(/\s+/g, "_").slice(0, 24);
    username = safe;

    const host = window.location.host;
    localStorage.setItem(`dogeUsername_${host}`, safe);

    if (codenameSetup) codenameSetup.style.display = "none";
    input.disabled = false;
    input.placeholder = "type your transmission...";

    codenameInput.value = "";
    tryJoin();
  });
}

// ---- main chat form ----
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!username) {
    // should not happen if UI used properly
    return;
  }

  let text = input.value.trim();
  if (!text) return;

  // ----- /clearall (admin: clears server history + everyone’s screen) -----
  if (/^\/clearall$/i.test(text)) {
    socket.emit("adminCommand", { action: "clearHistory" });
    input.value = "";
    return;
  }

  // ----- /clear (local only: clears your screen) -----
  if (/^\/clear$/i.test(text)) {
    messages.innerHTML = "";
    input.value = "";
    return;
  }

  // ----- /admin secret -----
  const adminMatch = text.match(/^\/admin\s+(.+)/i);
  if (adminMatch) {
    const pwd = adminMatch[1].trim();
    if (pwd) {
      socket.emit("adminLogin", { password: pwd });
    }
    input.value = "";
    return;
  }

  // ----- /nick newname -----
  const nickMatch = text.match(/^\/nick\s+(.+)/i);
  if (nickMatch) {
    const rawNewName = nickMatch[1].trim();
    if (rawNewName) {
      const safe = rawNewName.replace(/\s+/g, "_").slice(0, 24);
      const host = window.location.host;
      localStorage.setItem(`dogeUsername_${host}`, safe);
      username = safe;
      socket.emit("changeNick", { newName: safe });
    }
    input.value = "";
    return;
  }

  // ----- Admin moderation: /mute, /unmute, /ban -----
  const muteMatch = text.match(/^\/mute\s+(.+)/i);
  if (muteMatch) {
    const target = muteMatch[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "mute", target });
    }
    input.value = "";
    return;
  }

  const unmuteMatch = text.match(/^\/unmute\s+(.+)/i);
  if (unmuteMatch) {
    const target = unmuteMatch[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "unmute", target });
    }
    input.value = "";
    return;
  }

  const banMatch = text.match(/^\/ban\s+(.+)/i);
  if (banMatch) {
    const target = banMatch[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "ban", target });
    }
    input.value = "";
    return;
  }

  // ----- /agent question -----
  const agentMatch = text.match(/^\/agent\s+(.+)/i);
  if (agentMatch) {
    const question = agentMatch[1].trim();
    if (question) {
      socket.emit("chatMessage", {
        text: `Agent query: ${question}`
      });
      socket.emit("agentRequest", { question });
    }
    input.value = "";
    return;
  }

  // ----- SLASH COMMANDS / FILTERS (links) -----
  if (/^\/x$/i.test(text)) {
    text = "Official X account: https://x.com/muchdogeagent";
  } else if (/^\/website$/i.test(text)) {
    text = "Official website: https://dogeagent.org";
  } else {
    // inline replacements
    text = text.replace(
      /\b\/x\b/gi,
      "https://x.com/muchdogeagent"
    );
    text = text.replace(
      /\b\/website\b/gi,
      "https://dogeagent.org"
    );
  }

  // send normal message
  socket.emit("chatMessage", { text });
  input.value = "";
});
