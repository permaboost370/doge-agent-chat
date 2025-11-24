const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const userListEl = document.getElementById("user-list");
const userCountEl = document.getElementById("user-count");

const codenameSetup = document.getElementById("codename-setup");
const codenameForm = document.getElementById("codename-form");
const codenameInput = document.getElementById("codename-input");

const pinnedBar = document.getElementById("pinned-bar");
const pinnedTextEl = document.getElementById("pinned-text");

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
let introShown = false;
let historyLoaded = false;

// try to join room whenever we have a username and a live socket
function joinIfReady() {
  if (socket.connected && username) {
    socket.emit("joinRoom", { room, username });
    if (!introShown) {
      playIntro();
      introShown = true;
    }
  }
}

socket.on("connect", () => {
  console.log("Socket connected", socket.id);
  joinIfReady();
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
    "C:\\\\DOGEOS\\\\LOBBY>\n" +
    `> ASSIGNED CODENAME: ${username}\n` +
    "> ALL TRANSMISSIONS ARE PUBLIC IN THIS ROOM.\n" +
    "> TYPE TO BROADCAST TO OTHER AGENTS.\n";

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

  const mime = format === "mp3" ? "audio/mpeg" : "audio/" + format;
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

  for (let r = 0; r < rawLines.length; r++) {
    const line = rawLines[r].trim();
    if (!line) continue;

    const words = line.split(/\s+/);
    let current = "";

    for (let w = 0; w < words.length; w++) {
      const word = words[w];
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
function addBoxedMessage(text, who, label) {
  if (who === undefined) who = "user";
  if (label === undefined) label = "";

  const div = document.createElement("div");
  div.className = "msg " + who;
  messages.appendChild(div);

  const MAX_CONTENT_WIDTH = 70;
  const lines = wrapTextLines(text, MAX_CONTENT_WIDTH);

  const prefix = label ? label + "> " : "";
  const labeledLines = lines.map(function (l) {
    return prefix + l;
  });

  let maxLen = 0;
  for (let i = 0; i < labeledLines.length; i++) {
    if (labeledLines[i].length > maxLen) {
      maxLen = labeledLines[i].length;
    }
  }

  const border = "+" + Array(maxLen + 3).join("-") + "+";

  let boxedHTML = border + "<br>";
  for (let i = 0; i < labeledLines.length; i++) {
    const line = labeledLines[i];
    const paddingLen = maxLen - line.length;
    const padding = Array(paddingLen + 1).join(" ");
    boxedHTML += "| " + line + padding + " |";
    if (i !== labeledLines.length - 1) {
      boxedHTML += "<br>";
    }
  }
  boxedHTML += "<br>" + border;

  // clickable URLs
  boxedHTML = boxedHTML.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" class="chat-link">$1</a>'
  );

  typeWriterHTML(div, boxedHTML, 5);
  messages.scrollTop = messages.scrollHeight;
}

// ---- sidebar updates ----
socket.on("roomUsers", function (payload) {
  const users = payload.users || [];
  const count = payload.count || 0;

  if (userCountEl) {
    userCountEl.textContent = String(count);
  }
  if (!userListEl) return;

  userListEl.innerHTML = "";

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const li = document.createElement("li");
    li.textContent = u === username ? u + " (you)" : u;
    if (u === username) {
      li.classList.add("user-me");
    }
    userListEl.appendChild(li);
  }
});

// ---- history replay from server ----
socket.on("history", function (payload) {
  if (historyLoaded) return; // avoid duplicate history on reconnect
  historyLoaded = true;

  const entries = payload.entries;
  if (!entries || !entries.length) return;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
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
socket.on("clearHistory", function () {
  messages.innerHTML = "";
});

// pinned message updates
socket.on("pinUpdate", function (payload) {
  if (!pinnedBar || !pinnedTextEl) return;

  const text = payload.text;
  if (text && String(text).trim().length > 0) {
    pinnedBar.style.display = "flex";
    pinnedTextEl.textContent = text;
  } else {
    pinnedBar.style.display = "none";
    pinnedTextEl.textContent = "";
  }
});

// admin login status
socket.on("adminStatus", function (payload) {
  const ok = payload.ok;
  const message = payload.message || "Admin status changed.";
  if (ok) {
    isAdmin = true;
  }
  addBoxedMessage(message, "system", "SYS");
});

// system messages
socket.on("systemMessage", function (payload) {
  const text = payload.text || "";
  addBoxedMessage(text, "system", "SYS");
});

// incoming chat messages from humans
socket.on("chatMessage", function (payload) {
  const fromUser = payload.username;
  const text = payload.text || "";

  if (fromUser === username) {
    addBoxedMessage(text, "user", "YOU");
  } else {
    addBoxedMessage(text, "bot", fromUser);
  }
});

// Agent Doge messages
socket.on("agentMessage", function (payload) {
  const agentName = payload.username || "DogeAgent067";
  const text = payload.text || "";
  const audioBase64 = payload.audioBase64 || null;
  const audioFormat = payload.audioFormat || "mp3";

  addBoxedMessage(text, "bot", agentName);
  if (audioBase64) {
    playReplyAudio(audioBase64, audioFormat);
  }
});

// ---- codename form logic ----
if (codenameForm) {
  codenameForm.addEventListener("submit", function (e) {
    e.preventDefault();
    let val = (codenameInput.value || "").trim();
    if (!val) return;

    let safe = val.replace(/\s+/g, "_").slice(0, 24);
    username = safe;

    const host = window.location.host;
    localStorage.setItem("dogeUsername_" + host, safe);

    if (codenameSetup) codenameSetup.style.display = "none";
    input.disabled = false;
    input.placeholder = "type your transmission...";

    codenameInput.value = "";
    joinIfReady();
  });
}

// ---- main chat form ----
form.addEventListener("submit", function (e) {
  e.preventDefault();
  if (!username) {
    // codename not set yet
    return;
  }

  let text = input.value.trim();
  if (!text) return;

  // ----- /clearall (admin: clears server history + everyone’s screen) -----
  if (/^\s*\/clearall\b/i.test(text)) {
    socket.emit("adminCommand", { action: "clearHistory" });
    input.value = "";
    return;
  }

  // ----- /clear (local only: clears your screen) -----
  if (/^\s*\/clear\b/i.test(text)) {
    messages.innerHTML = "";
    input.value = "";
    return;
  }

  // ----- /admin secret -----
  let match = text.match(/^\s*\/admin\s+(.+)/i);
  if (match) {
    const pwd = match[1].trim();
    if (pwd) {
      socket.emit("adminLogin", { password: pwd });
    }
    input.value = "";
    return;
  }

  // ----- /nick newname -----
  match = text.match(/^\s*\/nick\s+(.+)/i);
  if (match) {
    const rawNewName = match[1].trim();
    if (rawNewName) {
      const safe = rawNewName.replace(/\s+/g, "_").slice(0, 24);
      const host = window.location.host;
      localStorage.setItem("dogeUsername_" + host, safe);
      username = safe;
      socket.emit("changeNick", { newName: safe });
    }
    input.value = "";
    return;
  }

  // ----- Admin moderation: /mute, /unmute, /ban, /kick, /kickall, /pin, /unpin -----
  match = text.match(/^\s*\/mute\s+(.+)/i);
  if (match) {
    const target = match[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "mute", target: target });
    }
    input.value = "";
    return;
  }

  match = text.match(/^\s*\/unmute\s+(.+)/i);
  if (match) {
    const target = match[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "unmute", target: target });
    }
    input.value = "";
    return;
  }

  match = text.match(/^\s*\/ban\s+(.+)/i);
  if (match) {
    const target = match[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "ban", target: target });
    }
    input.value = "";
    return;
  }

  match = text.match(/^\s*\/kick\s+(.+)/i);
  if (match) {
    const target = match[1].trim();
    if (target) {
      socket.emit("adminCommand", { action: "kick", target: target });
    }
    input.value = "";
    return;
  }

  if (/^\s*\/kickall\b/i.test(text)) {
    socket.emit("adminCommand", { action: "kickall" });
    input.value = "";
    return;
  }

  match = text.match(/^\s*\/pin\s+(.+)/i);
  if (match) {
    const pinText = match[1].trim();
    if (pinText) {
      socket.emit("adminCommand", { action: "pin", target: pinText });
    }
    input.value = "";
    return;
  }

  if (/^\s*\/unpin\b/i.test(text)) {
    socket.emit("adminCommand", { action: "unpin" });
    input.value = "";
    return;
  }

  // ----- /agent question -----
  match = text.match(/^\s*\/agent\s+(.+)/i);
  if (match) {
    const question = match[1].trim();
    if (question) {
      socket.emit("chatMessage", {
        text: "Agent query: " + question
      });
      socket.emit("agentRequest", { question: question });
    }
    input.value = "";
    return;
  }

  // ----- SLASH COMMANDS / FILTERS (links) -----
  if (/^\s*\/x\b/i.test(text)) {
    text = "Official X account: https://x.com/muchdogeagent";
  } else if (/^\s*\/website\b/i.test(text)) {
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
  socket.emit("chatMessage", { text: text });
  input.value = "";
});
