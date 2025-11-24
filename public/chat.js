const form = document.getElementById("chat-form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const userListEl = document.getElementById("user-list");
const userCountEl = document.getElementById("user-count");

// --- generate / remember username per host ---
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

socket.on("connect", () => {
  socket.emit("joinRoom", { room, username });
});

// plain text typewriter (for intro)
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

// HTML typewriter (for boxed messages with links)
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

// intro text
const introText =
  `C:\\DOGEOS\\LOBBY>\n` +
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

// render messages in box style with clickable links
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

  // Build HTML with <br> instead of newline
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

  // Make URLs clickable
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

// system messages (join/leave)
socket.on("systemMessage", ({ text }) => {
  addBoxedMessage(text, "system", "SYS");
});

// incoming chat messages
socket.on("chatMessage", ({ username: fromUser, text, timestamp }) => {
  if (fromUser === username) {
    addBoxedMessage(text, "user", "YOU");
  } else {
    addBoxedMessage(text, "bot", fromUser);
  }
});

// sending messages
form.addEventListener("submit", (e) => {
  e.preventDefault();
  let text = input.value.trim();
  if (!text) return;

  // ----- SLASH COMMANDS / FILTERS -----
  // exact commands
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

  socket.emit("chatMessage", { text });
  input.value = "";
});
