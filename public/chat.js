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
const imageInput = document.getElementById("image-input");

let isAdmin = false;

// --- get stored username per host (no random fallback) ---
function getStoredUsername() {
  const host = window.location.host;
  const key = "dogeUsername_" + host;
  const value = localStorage.getItem(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

let username = getStoredUsername();
const room = window.location.host;

if (username) {
  if (codenameSetup) codenameSetup.style.display = "none";
  input.disabled = false;
  input.placeholder = "type your transmission...";
} else {
  if (codenameSetup) codenameSetup.style.display = "block";
  input.disabled = true;
  input.placeholder = "set codename above to start...";
}

// --- socket.io connection ---
const socket = io();
let introShown = false;
let historyLoaded = false;

function joinIfReady() {
  if (socket.connected && username) {
    socket.emit("joinRoom", { room: room, username: username });
    if (!introShown) {
      playIntro();
      introShown = true;
    }
  }
}

socket.on("connect", function () {
  console.log("Socket connected", socket.id);
  joinIfReady();
});

// ---------- Typewriter helpers ----------

function typeWriter(element, text, speed, onComplete) {
  if (speed === undefined) speed = 15;
  let i = 0;
  element.classList.add("typing");

  const interval = setInterval(function () {
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

function typeWriterHTML(element, html, speed, onComplete) {
  if (speed === undefined) speed = 10;
  let i = 0;
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const fullHTML = tempDiv.innerHTML;

  const interval = setInterval(function () {
    element.innerHTML =
      fullHTML.slice(0, i) + "<span class='cursor'>|</span>";
    i++;
    messages.scrollTop = messages.scrollHeight;

    if (i >= fullHTML.length) {
      clearInterval(interval);
      element.innerHTML = fullHTML;
      if (typeof onComplete === "function") onComplete();
    }
  }, speed);
}

function playIntro() {
  const introText =
    "C:\\\\DOGEOS\\\\LOBBY>\n" +
    "> ASSIGNED CODENAME: " +
    username +
    "\n" +
    "> ALL TRANSMISSIONS ARE PUBLIC IN THIS ROOM.\n" +
    "> TYPE TO BROADCAST TO OTHER AGENTS.\n";

  const div = document.createElement("div");
  div.className = "msg system typing";
  messages.appendChild(div);
  typeWriter(div, introText, 20);
}

// ---------- Audio helpers for Agent ----------

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

function playReplyAudio(base64, format) {
  if (!base64) return;

  const fmt = format || "mp3";
  const mime = fmt === "mp3" ? "audio/mpeg" : "audio/" + fmt;
  const blob = base64ToBlob(base64, mime);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  audio.play().catch(function (err) {
    console.warn("Agent audio autoplay blocked or failed:", err);
  });
}

// ---------- Text wrapping + render ----------

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

function addBoxedMessage(text, who, label) {
  if (who === undefined) who = "user";
  if (label === undefined) label = "";

  const div = document.createElement("div");
  div.className = "msg " + who;
  messages.appendChild(div);

  const MAX_CONTENT_WIDTH = 70;
  const lines = wrapTextLines(text, MAX_CONTENT_WIDTH);

  const prefix = label ? label + "> " : "";
  const labeledLines = [];
  for (let i = 0; i < lines.length; i++) {
    labeledLines.push(prefix + lines[i]);
  }

  let maxLen = 0;
  for (let i = 0; i < labeledLines.length; i++) {
    if (labeledLines[i].length > maxLen) {
      maxLen = labeledLines[i].length;
    }
  }

  const border = "+" + new Array(maxLen + 3).join("-") + "+";

  let boxedHTML = border + "<br>";
  for (let i = 0; i < labeledLines.length; i++) {
    const line = labeledLines[i];
    const paddingLen = maxLen - line.length;
    const padding = new Array(paddingLen + 1).join(" ");
    boxedHTML += "| " + line + padding + " |";
    if (i !== labeledLines.length - 1) {
      boxedHTML += "<br>";
    }
  }
  boxedHTML += "<br>" + border;

  boxedHTML = boxedHTML.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" class="chat-link">$1</a>'
  );

  typeWriterHTML(div, boxedHTML, 5);
  messages.scrollTop = messages.scrollHeight;
}

function addImageMessage(fromUser, imageBase64, mimeType, isSelf) {
  const div = document.createElement("div");
  div.className = "msg " + (isSelf ? "user" : "bot");

  const label = document.createElement("div");
  if (isSelf) {
    label.textContent = "YOU> sent an image";
  } else {
    label.textContent = fromUser + "> sent an image";
  }

  const img = document.createElement("img");
  img.className = "chat-image";
  img.src = "data:" + mimeType + ";base64," + imageBase64;

  div.appendChild(label);
  div.appendChild(img);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// ---------- Sidebar updates ----------

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

// ---------- History replay ----------

socket.on("history", function (payload) {
  if (historyLoaded) return;
  historyLoaded = true;

  const entries = payload.entries;
  if (!entries || !entries.length) return;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const kind = entry.kind;
    const fromUser = entry.username;
    const text = entry.text || "";
    const mimeType = entry.mimeType;
    const imageBase64 = entry.imageBase64;

    if (kind === "chat") {
      if (!text.trim()) continue;
      if (fromUser === username) {
        addBoxedMessage(text, "user", "YOU");
      } else {
        addBoxedMessage(text, "bot", fromUser || "Agent");
      }
    } else if (kind === "system") {
      if (!text.trim()) continue;
      addBoxedMessage(text, "system", "SYS");
    } else if (kind === "agent") {
      if (!text.trim()) continue;
      addBoxedMessage(text, "bot", fromUser || "DogeAgent067");
    } else if (kind === "image" && imageBase64 && mimeType) {
      const isSelf = fromUser === username;
      addImageMessage(fromUser || "Agent", imageBase64, mimeType, isSelf);
    }
  }
});

// ---------- Clear history from server ----------

socket.on("clearHistory", function () {
  messages.innerHTML = "";
});

// ---------- Pinned bar updates ----------

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

// ---------- Admin status ----------

socket.on("adminStatus", function (payload) {
  const ok = payload.ok;
  const message = payload.message || "Admin status changed.";
  if (ok) {
    isAdmin = true;
  }
  addBoxedMessage(message, "system", "SYS");
});

// ---------- System messages ----------

socket.on("systemMessage", function (payload) {
  const text = payload.text || "";
  if (!text.trim()) return;
  addBoxedMessage(text, "system", "SYS");
});

// ---------- Public chat messages ----------

socket.on("chatMessage", function (payload) {
  const fromUser = payload.username;
  const text = payload.text || "";
  if (!text.trim()) return;

  if (fromUser === username) {
    addBoxedMessage(text, "user", "YOU");
  } else {
    addBoxedMessage(text, "bot", fromUser);
  }
});

// ---------- Agent messages ----------

socket.on("agentMessage", function (payload) {
  const agentName = payload.username || "DogeAgent067";
  const text = payload.text || "";
  const audioBase64 = payload.audioBase64 || null;
  const audioFormat = payload.audioFormat || "mp3";

  if (text.trim()) {
    addBoxedMessage(text, "bot", agentName);
  }
  if (audioBase64) {
    playReplyAudio(audioBase64, audioFormat);
  }
});

// ---------- Private DM messages ----------

socket.on("dmMessage", function (payload) {
  const from = payload.from;
  const to = payload.to;
  const text = payload.text || "";

  if (!text.trim()) return;

  let label;
  let whoClass = "dm";

  if (from === username) {
    label = "DM to " + to;
    whoClass += " user";
  } else if (to === username) {
    label = "DM from " + from;
    whoClass += " system";
  } else {
    label = "DM";
  }

  addBoxedMessage(text, whoClass, label);
});

// ---------- Image messages (live) ----------

socket.on("imageMessage", function (payload) {
  const fromUser = payload.username;
  const imageBase64 = payload.imageBase64;
  const mimeType = payload.mimeType;

  if (!imageBase64 || !mimeType) return;

  const isSelf = fromUser === username;
  addImageMessage(fromUser || "Agent", imageBase64, mimeType, isSelf);
});

// ---------- Codename form ----------

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

// ---------- Image upload handler (50% resize) ----------

if (imageInput) {
  imageInput.addEventListener("change", function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      socket.emit("systemMessage", {
        text: "Only image files are allowed."
      });
      imageInput.value = "";
      return;
    }

    // basic size check ~2MB
    if (file.size > 2 * 1024 * 1024) {
      socket.emit("systemMessage", {
        text: "Image too large. Please keep it under 2MB."
      });
      imageInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const img = new Image();
      img.onload = function () {
        // Resize to 50%
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const newWidth = img.width * 0.5;
        const newHeight = img.height * 0.5;

        canvas.width = newWidth;
        canvas.height = newHeight;

        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Convert resized canvas to Base64
        const resizedBase64 = canvas
          .toDataURL(file.type, 0.9) // slight compression too
          .split(",")[1];

        socket.emit("imageMessage", {
          imageBase64: resizedBase64,
          mimeType: file.type
        });

        imageInput.value = "";
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- Main chat form ----------

form.addEventListener("submit", function (e) {
  e.preventDefault();
  if (!username) {
    return;
  }

  let text = input.value.trim();
  if (!text) return;

  // /clearall
  if (/^\s*\/clearall\b/i.test(text)) {
    socket.emit("adminCommand", { action: "clearHistory" });
    input.value = "";
    return;
  }

  // /clear
  if (/^\s*\/clear\b/i.test(text)) {
    messages.innerHTML = "";
    input.value = "";
    return;
  }

  // /admin pwd
  let match = text.match(/^\s*\/admin\s+(.+)/i);
  if (match) {
    const pwd = match[1].trim();
    if (pwd) {
      socket.emit("adminLogin", { password: pwd });
    }
    input.value = "";
    return;
  }

  // /nick newname
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

  // Admin: /mute, /unmute, /ban, /kick, /kickall, /pin, /unpin
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

  // /dm username message
  match = text.match(/^\s*\/dm\s+(\S+)\s+(.+)/i);
  if (match) {
    const targetName = match[1].trim();
    const msg = match[2].trim();
    if (targetName && msg) {
      socket.emit("dmMessage", { target: targetName, text: msg });
    }
    input.value = "";
    return;
  }

  // /agent question
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

  // /x and /website
  if (/^\s*\/x\b/i.test(text)) {
    text = "Official X account: https://x.com/muchdogeagent";
  } else if (/^\s*\/website\b/i.test(text)) {
    text = "Official website: https://dogeagent.org";
  } else {
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
