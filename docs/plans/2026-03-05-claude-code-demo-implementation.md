# Claude Code Demo Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a workshop platform where participants use Claude Code CLI to build web apps live, with a facilitator dashboard showing real-time progress.

**Architecture:** Single Express server with socket.io for real-time communication. Claude Code CLI spawned per table, writing HTML files to disk. Puppeteer captures screenshots for dashboard thumbnails.

**Tech Stack:** Node.js, Express, socket.io, Puppeteer, fs.watch, plain HTML/CSS/JS

---

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config.js`

**Step 1: Initialize npm and install dependencies**

```bash
cd /Users/huiliang/GitHub/school-ai
npm init -y
npm install express socket.io puppeteer
```

**Step 2: Create .gitignore**

```
node_modules/
tables/
screenshots/
.DS_Store
```

**Step 3: Create config.js**

```js
module.exports = {
  port: process.env.PORT || 3000,
  maxTables: parseInt(process.env.MAX_TABLES) || 25,
  cliTimeout: 120000,
  screenshotInterval: 5000,
  systemPrompts: {
    create: `You are a web developer. Generate a single-file website (HTML/CSS/JS all in one index.html). Do not run shell commands. Do not access any files other than index.html. Focus on creating a beautiful, functional website based on the user's description.`,
    customize: `You are a web developer. Modify the existing index.html based on the user's request. Keep all code in the single file. Do not run shell commands. Do not access any files other than index.html. Be creative with the customizations.`,
    'go-wild': `You are a web developer. Take the existing index.html and make it extraordinary. Add animations, interactions, easter eggs, or completely transform it. Keep all code in the single file. Do not run shell commands. Do not access any files other than index.html. Go wild!`
  },
  allowedTools: 'Write,Edit,Read',
};
```

**Step 4: Commit**

```bash
git init
git add package.json package-lock.json .gitignore config.js CLAUDE.md docs/
git commit -m "feat: initialize project with dependencies and config"
```

---

### Task 2: Express Server with Static Serving and Table Directories

**Files:**
- Create: `server.js`
- Create: `public/` directory structure

**Step 1: Create directory structure**

```bash
mkdir -p public/css public/js tables screenshots
```

**Step 2: Write server.js — basic Express + socket.io setup**

```js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- State ---
const tableState = {};

function initTableState() {
  for (let i = 1; i <= config.maxTables; i++) {
    const dir = path.join(__dirname, 'tables', `table-${i}`);
    fs.mkdirSync(dir, { recursive: true });

    const htmlPath = path.join(dir, 'index.html');
    const hasFile = fs.existsSync(htmlPath) && fs.statSync(htmlPath).size > 0;

    tableState[i] = {
      status: hasFile ? 'done' : 'idle',
      process: null,
      timestamp: Date.now(),
    };
  }
}

// --- Static routes ---
app.use(express.static(path.join(__dirname, 'public')));

// Serve table previews
for (let i = 1; i <= config.maxTables; i++) {
  app.use(`/preview/${i}`, express.static(path.join(__dirname, 'tables', `table-${i}`)));
}

// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Route: participant page
app.get('/table/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'participant.html'));
});

// Route: facilitator dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// API: get all table states
app.get('/api/state', (req, res) => {
  const states = {};
  for (const [id, state] of Object.entries(tableState)) {
    states[id] = { status: state.status, timestamp: state.timestamp };
  }
  res.json({ tables: states, maxTables: config.maxTables });
});

// API: get table code
app.get('/api/table/:id/code', (req, res) => {
  const id = parseInt(req.params.id);
  const htmlPath = path.join(__dirname, 'tables', `table-${id}`, 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.type('text/plain').send(fs.readFileSync(htmlPath, 'utf-8'));
  } else {
    res.type('text/plain').send('');
  }
});

// --- Socket.io ---
io.on('connection', (socket) => {
  // Send current state on connect
  const states = {};
  for (const [id, state] of Object.entries(tableState)) {
    states[id] = { status: state.status, timestamp: state.timestamp };
  }
  socket.emit('state-sync', { tables: states, maxTables: config.maxTables });

  socket.on('submit-prompt', (data) => {
    handlePromptSubmission(data, socket);
  });

  socket.on('reset-table', (data) => {
    handleReset(data);
  });
});

// --- CLI Process Management ---
const { spawn } = require('child_process');

function handlePromptSubmission({ table, prompt, step }) {
  const id = parseInt(table);
  if (!id || id < 1 || id > config.maxTables) return;

  if (tableState[id].status === 'building') {
    io.emit('status-update', { table: id, status: 'building', message: 'Already building' });
    return;
  }

  const tableDir = path.join(__dirname, 'tables', `table-${id}`);
  const claudeMdPath = path.join(tableDir, 'CLAUDE.md');
  const stepKey = step || 'create';
  const systemPrompt = config.systemPrompts[stepKey] || config.systemPrompts.create;

  // Write per-table CLAUDE.md
  const claudeMdContent = `# Table ${id}\n\nYou are building a website for Table ${id}.\nCurrent step: ${stepKey}\nWrite all output to index.html in this directory.\nKeep everything in a single HTML file (inline CSS and JS).\n`;
  fs.writeFileSync(claudeMdPath, claudeMdContent);

  // Update state
  tableState[id].status = 'building';
  tableState[id].timestamp = Date.now();
  io.emit('status-update', { table: id, status: 'building' });

  // Spawn Claude Code CLI
  const args = [
    '--print',
    '--output-format', 'text',
    '--system-prompt', systemPrompt,
    '--allowedTools', config.allowedTools,
    prompt
  ];

  const proc = spawn('claude', args, {
    cwd: tableDir,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  tableState[id].process = proc;
  let output = '';

  proc.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });

  proc.stderr.on('data', (chunk) => {
    // Log but don't fail on stderr
    console.error(`[Table ${id}] stderr: ${chunk}`);
  });

  proc.on('close', (code) => {
    tableState[id].process = null;
    if (code === 0) {
      tableState[id].status = 'done';
      io.emit('status-update', { table: id, status: 'done' });
      io.emit('code-update', { table: id, code: output });
      triggerScreenshot(id);
    } else {
      tableState[id].status = 'error';
      io.emit('status-update', { table: id, status: 'error' });
    }
    tableState[id].timestamp = Date.now();
  });

  // Timeout
  const timeout = setTimeout(() => {
    if (tableState[id].process) {
      proc.kill('SIGTERM');
      tableState[id].status = 'error';
      tableState[id].process = null;
      io.emit('status-update', { table: id, status: 'error', message: 'Timeout' });
    }
  }, config.cliTimeout);

  proc.on('close', () => clearTimeout(timeout));
}

function handleReset(data) {
  if (data.all) {
    for (let i = 1; i <= config.maxTables; i++) {
      resetTable(i);
    }
  } else if (data.table) {
    resetTable(parseInt(data.table));
  }
}

function resetTable(id) {
  // Kill running process
  if (tableState[id]?.process) {
    tableState[id].process.kill('SIGTERM');
    tableState[id].process = null;
  }

  // Clear files
  const tableDir = path.join(__dirname, 'tables', `table-${id}`);
  const htmlPath = path.join(tableDir, 'index.html');
  const screenshotPath = path.join(__dirname, 'screenshots', `table-${id}.png`);
  if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
  if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);

  tableState[id] = { status: 'idle', process: null, timestamp: Date.now() };
  io.emit('status-update', { table: id, status: 'idle' });
}

// --- Screenshots (Puppeteer) ---
let browser = null;

async function initBrowser() {
  const puppeteer = require('puppeteer');
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

async function triggerScreenshot(id) {
  if (!browser) return;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`http://localhost:${config.port}/preview/${id}`, {
      waitUntil: 'networkidle0',
      timeout: 10000,
    });
    const screenshotPath = path.join(__dirname, 'screenshots', `table-${id}.png`);
    await page.screenshot({ path: screenshotPath });
    await page.close();
    io.emit('screenshot-ready', { table: id, url: `/screenshots/table-${id}.png?t=${Date.now()}` });
  } catch (err) {
    console.error(`[Screenshot] Table ${id} failed:`, err.message);
  }
}

// --- File Watching ---
function watchTableFiles() {
  for (let i = 1; i <= config.maxTables; i++) {
    const htmlPath = path.join(__dirname, 'tables', `table-${i}`, 'index.html');
    const dir = path.dirname(htmlPath);
    let debounce = null;
    fs.watch(dir, (eventType, filename) => {
      if (filename === 'index.html') {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (tableState[i].status === 'building') {
            // File changed while building — update will happen on process close
          } else {
            // External change
            triggerScreenshot(i);
          }
        }, 1000);
      }
    });
  }
}

// --- Start ---
async function start() {
  initTableState();
  await initBrowser();
  watchTableFiles();
  server.listen(config.port, () => {
    console.log(`Claude Code Demo running at http://localhost:${config.port}`);
    console.log(`Dashboard: http://localhost:${config.port}/dashboard`);
    console.log(`Tables: http://localhost:${config.port}/table/1 through /table/${config.maxTables}`);
  });
}

start().catch(console.error);

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  for (const state of Object.values(tableState)) {
    if (state.process) state.process.kill('SIGTERM');
  }
  if (browser) await browser.close();
  process.exit(0);
});
```

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add Express server with socket.io, CLI spawning, screenshots, and file watching"
```

---

### Task 3: Participant UI

**Files:**
- Create: `public/participant.html`
- Create: `public/css/participant.css`
- Create: `public/js/participant.js`

**Step 1: Write participant.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Demo</title>
  <link rel="stylesheet" href="/css/participant.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
</head>
<body>
  <header>
    <div class="header-left">
      <span class="table-badge" id="table-badge">Table ?</span>
      <span class="app-title">Claude Code Demo</span>
    </div>
    <div class="header-right">
      <button class="step-btn active" data-step="create">1. Create</button>
      <button class="step-btn" data-step="customize">2. Customize</button>
      <button class="step-btn" data-step="go-wild">3. Go Wild</button>
    </div>
  </header>
  <main>
    <div class="left-panel">
      <div class="prompt-section">
        <textarea id="prompt-input" placeholder="Describe the website you want to build..."></textarea>
        <button id="send-btn" class="send-btn">Send to Claude</button>
      </div>
      <div class="code-section">
        <div class="code-header">
          <span id="char-count">0 characters generated</span>
          <button id="toggle-code">Hide</button>
        </div>
        <pre id="code-display"><code class="language-html"></code></pre>
      </div>
    </div>
    <div class="right-panel">
      <div class="preview-container">
        <iframe id="preview-frame" sandbox="allow-scripts allow-same-origin"></iframe>
        <div id="building-overlay" class="overlay hidden">
          <div class="spinner"></div>
          <p>Building...</p>
        </div>
      </div>
    </div>
  </main>
  <script src="/socket.io/socket.io.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-markup.min.js"></script>
  <script src="/js/participant.js"></script>
</body>
</html>
```

**Step 2: Write participant.css**

```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-tertiary: #0f3460;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --accent: #e94560;
  --accent-hover: #ff6b6b;
  --success: #4caf50;
  --warning: #ff9800;
  --error: #f44336;
  --border: #2a2a4a;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.header-left { display: flex; align-items: center; gap: 12px; }

.table-badge {
  background: var(--accent);
  color: white;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
}

.app-title { font-size: 15px; font-weight: 500; }

.header-right { display: flex; gap: 4px; }

.step-btn {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.step-btn:hover { border-color: var(--accent); color: var(--text-primary); }
.step-btn.active { background: var(--accent); color: white; border-color: var(--accent); }

main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left-panel {
  width: 30%;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}

.prompt-section {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

#prompt-input {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  font-size: 14px;
  resize: none;
  height: 150px;
  font-family: inherit;
}

#prompt-input:focus { outline: none; border-color: var(--accent); }

.send-btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.send-btn:hover { background: var(--accent-hover); }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.code-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border);
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.code-header button {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
}

#code-display {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 0 16px 16px;
  font-size: 12px;
  line-height: 1.5;
  background: transparent;
}

#code-display code {
  background: transparent;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}

.right-panel {
  flex: 1;
  position: relative;
}

.preview-container {
  width: 100%;
  height: 100%;
  position: relative;
}

#preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: white;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.overlay.hidden { display: none; }

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
```

**Step 3: Write participant.js**

```js
(function () {
  const tableId = parseInt(window.location.pathname.split('/').pop());
  const socket = io();
  let currentStep = 'create';

  // DOM elements
  const badge = document.getElementById('table-badge');
  const promptInput = document.getElementById('prompt-input');
  const sendBtn = document.getElementById('send-btn');
  const codeDisplay = document.querySelector('#code-display code');
  const charCount = document.getElementById('char-count');
  const toggleCode = document.getElementById('toggle-code');
  const previewFrame = document.getElementById('preview-frame');
  const buildingOverlay = document.getElementById('building-overlay');
  const stepBtns = document.querySelectorAll('.step-btn');

  badge.textContent = `Table ${tableId}`;
  document.title = `Table ${tableId} — Claude Code Demo`;

  // Load existing preview
  previewFrame.src = `/preview/${tableId}`;

  // Load existing code
  fetch(`/api/table/${tableId}/code`)
    .then(r => r.text())
    .then(code => {
      if (code) {
        codeDisplay.textContent = code;
        charCount.textContent = `${code.length.toLocaleString()} characters generated`;
        if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
      }
    });

  // Step buttons
  stepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      stepBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStep = btn.dataset.step;
    });
  });

  // Send prompt
  sendBtn.addEventListener('click', () => {
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    socket.emit('submit-prompt', { table: tableId, prompt, step: currentStep });
    sendBtn.disabled = true;
  });

  // Toggle code panel
  let codeVisible = true;
  toggleCode.addEventListener('click', () => {
    const pre = document.getElementById('code-display');
    codeVisible = !codeVisible;
    pre.style.display = codeVisible ? 'block' : 'none';
    toggleCode.textContent = codeVisible ? 'Hide' : 'Show';
  });

  // Socket events
  socket.on('status-update', (data) => {
    if (data.table !== tableId) return;
    if (data.status === 'building') {
      buildingOverlay.classList.remove('hidden');
      sendBtn.disabled = true;
    } else {
      buildingOverlay.classList.add('hidden');
      sendBtn.disabled = false;
      if (data.status === 'done') {
        previewFrame.src = `/preview/${tableId}?t=${Date.now()}`;
        // Refresh code
        fetch(`/api/table/${tableId}/code`)
          .then(r => r.text())
          .then(code => {
            codeDisplay.textContent = code;
            charCount.textContent = `${code.length.toLocaleString()} characters generated`;
            if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
          });
      }
    }
  });

  socket.on('code-update', (data) => {
    if (data.table !== tableId) return;
    codeDisplay.textContent = data.code;
    charCount.textContent = `${data.code.length.toLocaleString()} characters generated`;
    if (typeof Prism !== 'undefined') Prism.highlightElement(codeDisplay);
  });
})();
```

**Step 4: Test manually**

```bash
node server.js
# Open http://localhost:3000/table/1 in browser
# Verify: page loads, table badge shows "Table 1", step buttons work
```

**Step 5: Commit**

```bash
git add public/
git commit -m "feat: add participant UI with prompt input, code display, and live preview"
```

---

### Task 4: Facilitator Dashboard UI

**Files:**
- Create: `public/dashboard.html`
- Create: `public/css/dashboard.css`
- Create: `public/js/dashboard.js`

**Step 1: Write dashboard.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facilitator Dashboard</title>
  <link rel="stylesheet" href="/css/dashboard.css">
</head>
<body>
  <header>
    <div class="header-left">
      <h1>Facilitator Dashboard</h1>
      <p class="subtitle">Live view of all tables</p>
    </div>
    <div class="header-right">
      <div class="stats">
        <span class="stat"><span class="dot done"></span> Done: <span id="count-done">0</span></span>
        <span class="stat"><span class="dot building"></span> Building: <span id="count-building">0</span></span>
        <span class="stat">Active: <span id="count-active">0</span> / <span id="count-total">0</span></span>
      </div>
      <button id="reset-all-btn" class="reset-btn">Reset All</button>
    </div>
  </header>
  <main id="grid"></main>

  <!-- Modal for live preview -->
  <div id="modal" class="modal hidden">
    <div class="modal-content">
      <button id="modal-close" class="modal-close">&times;</button>
      <iframe id="modal-frame" sandbox="allow-scripts allow-same-origin"></iframe>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/dashboard.js"></script>
</body>
</html>
```

**Step 2: Write dashboard.css**

```css
:root {
  --bg-primary: #121212;
  --bg-card: #1e1e1e;
  --bg-card-hover: #2a2a2a;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --border: #333;
  --dot-done: #4caf50;
  --dot-building: #ff9800;
  --dot-error: #f44336;
  --dot-idle: #555;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 30px;
  border-bottom: 1px solid var(--border);
}

.header-left h1 { font-size: 20px; font-weight: 600; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin-top: 2px; }

.header-right { display: flex; align-items: center; gap: 24px; }

.stats { display: flex; gap: 20px; font-size: 14px; }

.stat { display: flex; align-items: center; gap: 6px; }

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot.done { background: var(--dot-done); }
.dot.building { background: var(--dot-building); }
.dot.error { background: var(--dot-error); }
.dot.idle { background: var(--dot-idle); }

.reset-btn {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.reset-btn:hover { border-color: var(--text-primary); }

main {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 20px;
  padding: 24px 30px;
}

.table-card {
  background: var(--bg-card);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: background 0.2s;
  position: relative;
}

.table-card:hover { background: var(--bg-card-hover); }

.card-thumbnail {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.card-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-thumbnail .no-preview {
  color: var(--text-secondary);
  font-size: 13px;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
}

.card-label { font-size: 13px; }

.card-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.card-reset {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0,0,0,0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 14px;
  display: none;
  align-items: center;
  justify-content: center;
}

.table-card:hover .card-reset { display: flex; }

/* Modal */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal.hidden { display: none; }

.modal-content {
  width: 90vw;
  height: 85vh;
  background: white;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.modal-close {
  position: absolute;
  top: 10px;
  right: 14px;
  background: rgba(0,0,0,0.5);
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 20px;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

#modal-frame { width: 100%; height: 100%; border: none; }

@media (max-width: 1200px) { main { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 900px) { main { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 600px) { main { grid-template-columns: repeat(2, 1fr); } }
```

**Step 3: Write dashboard.js**

```js
(function () {
  const socket = io();
  const grid = document.getElementById('grid');
  const modal = document.getElementById('modal');
  const modalFrame = document.getElementById('modal-frame');
  const modalClose = document.getElementById('modal-close');
  const resetAllBtn = document.getElementById('reset-all-btn');

  let maxTables = 25;
  let tables = {};

  function createCard(id) {
    const card = document.createElement('div');
    card.className = 'table-card';
    card.dataset.table = id;
    card.innerHTML = `
      <button class="card-reset" title="Reset table">&times;</button>
      <div class="card-thumbnail">
        <span class="no-preview">No preview</span>
      </div>
      <div class="card-footer">
        <span class="card-label">Table ${id}</span>
        <span class="card-status"><span class="dot idle"></span> <span class="status-text">Idle</span></span>
      </div>
    `;

    // Click to open modal
    card.querySelector('.card-thumbnail').addEventListener('click', () => {
      modalFrame.src = `/preview/${id}?t=${Date.now()}`;
      modal.classList.remove('hidden');
    });

    // Reset button
    card.querySelector('.card-reset').addEventListener('click', (e) => {
      e.stopPropagation();
      socket.emit('reset-table', { table: id });
    });

    return card;
  }

  function renderGrid() {
    grid.innerHTML = '';
    for (let i = 1; i <= maxTables; i++) {
      grid.appendChild(createCard(i));
    }
  }

  function updateCard(id, status) {
    const card = grid.querySelector(`[data-table="${id}"]`);
    if (!card) return;

    const dot = card.querySelector('.card-status .dot');
    const text = card.querySelector('.status-text');
    dot.className = `dot ${status}`;
    text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  function updateScreenshot(id, url) {
    const card = grid.querySelector(`[data-table="${id}"]`);
    if (!card) return;
    const thumb = card.querySelector('.card-thumbnail');
    thumb.innerHTML = `<img src="${url}" alt="Table ${id} preview">`;
  }

  function clearScreenshot(id) {
    const card = grid.querySelector(`[data-table="${id}"]`);
    if (!card) return;
    const thumb = card.querySelector('.card-thumbnail');
    thumb.innerHTML = `<span class="no-preview">No preview</span>`;
  }

  function updateCounters() {
    let done = 0, building = 0, active = 0;
    for (const [id, state] of Object.entries(tables)) {
      if (state.status === 'done') { done++; active++; }
      else if (state.status === 'building') { building++; active++; }
      else if (state.status === 'error') { active++; }
    }
    document.getElementById('count-done').textContent = done;
    document.getElementById('count-building').textContent = building;
    document.getElementById('count-active').textContent = active;
    document.getElementById('count-total').textContent = maxTables;
  }

  // Socket events
  socket.on('state-sync', (data) => {
    maxTables = data.maxTables;
    tables = data.tables;
    renderGrid();
    for (const [id, state] of Object.entries(tables)) {
      updateCard(id, state.status);
      if (state.status === 'done') {
        updateScreenshot(id, `/screenshots/table-${id}.png?t=${state.timestamp}`);
      }
    }
    updateCounters();
  });

  socket.on('status-update', (data) => {
    tables[data.table] = { status: data.status, timestamp: Date.now() };
    updateCard(data.table, data.status);
    if (data.status === 'idle') clearScreenshot(data.table);
    updateCounters();
  });

  socket.on('screenshot-ready', (data) => {
    updateScreenshot(data.table, data.url);
  });

  // Modal close
  modalClose.addEventListener('click', () => {
    modal.classList.add('hidden');
    modalFrame.src = '';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      modalFrame.src = '';
    }
  });

  // Reset all
  resetAllBtn.addEventListener('click', () => {
    if (confirm('Reset all tables?')) {
      socket.emit('reset-table', { all: true });
    }
  });
})();
```

**Step 4: Test manually**

```bash
node server.js
# Open http://localhost:3000/dashboard
# Verify: grid renders 25 cards, counters show, Reset All works
```

**Step 5: Commit**

```bash
git add public/dashboard.html public/css/dashboard.css public/js/dashboard.js
git commit -m "feat: add facilitator dashboard with live grid, modal preview, and status counters"
```

---

### Task 5: Integration Testing & Polish

**Step 1: Test full flow**

```bash
node server.js
# Terminal 1: Open http://localhost:3000/table/1
# Terminal 2: Open http://localhost:3000/dashboard
# In table 1: type a prompt, click "Send to Claude"
# Verify: status changes to building on dashboard, then done
# Verify: screenshot appears in dashboard, preview loads in participant iframe
# Verify: code panel shows generated HTML
# Click thumbnail on dashboard → verify modal opens with live preview
# Click Reset All → verify all tables reset
```

**Step 2: Add npm scripts to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "npx nodemon server.js"
  }
}
```

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add npm start and dev scripts"
```

---

### Task 6: README

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

```markdown
# Claude Code Demo

A workshop platform where participants use Claude Code to build web applications live, while a facilitator monitors progress on a real-time dashboard.

## Prerequisites

- Node.js 18+
- Claude Code CLI installed and authenticated (`claude` command available)
- Chromium/Chrome (for Puppeteer screenshots)

## Quick Start

npm install
npm start

- **Dashboard:** http://localhost:3000/dashboard
- **Participant:** http://localhost:3000/table/1 (through /table/25)

## Configuration

Edit `config.js` to change:
- `maxTables` — number of participant tables (default: 25)
- `port` — server port (default: 3000)
- `cliTimeout` — max build time per table (default: 120s)
- `systemPrompts` — constraints for each step (Create/Customize/Go Wild)

## Workshop Setup

1. Start the server on your machine
2. Share your IP address with participants (e.g., `http://192.168.1.x:3000/table/N`)
3. Open the dashboard on the projector at `/dashboard`
4. Assign each table a number
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```
