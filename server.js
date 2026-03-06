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

  socket.on('set-tables', (data) => {
    const count = parseInt(data.count);
    if (count >= 1 && count <= 50) {
      setMaxTables(count);
    }
  });
});

// --- Ollama LLM Integration ---
const activeRequests = {};

function extractHtml(text) {
  // Try to extract HTML from markdown code fences first
  const fenceMatch = text.match(/```html?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find raw HTML
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();

  // If it starts with < assume it's all HTML
  if (text.trim().startsWith('<')) return text.trim();

  return null;
}

async function handlePromptSubmission({ table, prompt, step }) {
  const id = parseInt(table);
  if (!id || id < 1 || id > config.maxTables) return;

  if (tableState[id].status === 'building') {
    io.emit('status-update', { table: id, status: 'building', message: 'Already building' });
    return;
  }

  const tableDir = path.join(__dirname, 'tables', `table-${id}`);
  const htmlPath = path.join(tableDir, 'index.html');
  const stepKey = step || 'create';
  const systemPrompt = config.systemPrompts[stepKey] || config.systemPrompts.create;

  // For customize/go-wild, include existing HTML as context
  let userPrompt = prompt;
  if (stepKey !== 'create' && fs.existsSync(htmlPath)) {
    const existingHtml = fs.readFileSync(htmlPath, 'utf-8');
    userPrompt = `Here is the current website HTML:\n\n${existingHtml}\n\nUser request: ${prompt}`;
  }

  // Update state
  tableState[id].status = 'building';
  tableState[id].timestamp = Date.now();
  io.emit('status-update', { table: id, status: 'building' });

  // Create an AbortController for timeout/cancel
  const controller = new AbortController();
  activeRequests[id] = controller;

  const timeout = setTimeout(() => {
    controller.abort();
  }, config.requestTimeout);

  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt: userPrompt,
        system: systemPrompt,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeout);
      throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
    }

    // Stream NDJSON response
    let fullOutput = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) {
            fullOutput += chunk.response;
            // Stream code chunk to participant
            io.emit('code-stream', { table: id, chunk: chunk.response, full: fullOutput });
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }

    clearTimeout(timeout);
    delete activeRequests[id];

    const html = extractHtml(fullOutput) || fullOutput;

    // Write HTML to file
    fs.writeFileSync(htmlPath, html);

    tableState[id].status = 'done';
    tableState[id].timestamp = Date.now();
    io.emit('status-update', { table: id, status: 'done' });
    io.emit('code-update', { table: id, code: html });
    triggerScreenshot(id);

    console.log(`[Table ${id}] Done (${html.length} chars)`);
  } catch (err) {
    clearTimeout(timeout);
    delete activeRequests[id];

    tableState[id].status = 'error';
    tableState[id].timestamp = Date.now();

    if (err.name === 'AbortError') {
      console.error(`[Table ${id}] Timeout after ${config.requestTimeout}ms`);
      io.emit('status-update', { table: id, status: 'error', message: 'Timeout' });
    } else {
      console.error(`[Table ${id}] Error:`, err.message);
      io.emit('status-update', { table: id, status: 'error', message: err.message });
    }
  }
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
  // Abort active request
  if (activeRequests[id]) {
    activeRequests[id].abort();
    delete activeRequests[id];
  }

  const tableDir = path.join(__dirname, 'tables', `table-${id}`);
  const htmlPath = path.join(tableDir, 'index.html');
  const screenshotPath = path.join(__dirname, 'screenshots', `table-${id}.png`);
  if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
  if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);

  tableState[id] = { status: 'idle', process: null, timestamp: Date.now() };
  io.emit('status-update', { table: id, status: 'idle' });
}

function setMaxTables(count) {
  const oldMax = config.maxTables;
  config.maxTables = count;

  // Add new tables
  for (let i = oldMax + 1; i <= count; i++) {
    const dir = path.join(__dirname, 'tables', `table-${i}`);
    fs.mkdirSync(dir, { recursive: true });
    const htmlPath = path.join(dir, 'index.html');
    const hasFile = fs.existsSync(htmlPath) && fs.statSync(htmlPath).size > 0;
    tableState[i] = { status: hasFile ? 'done' : 'idle', process: null, timestamp: Date.now() };
  }

  // Clean up removed tables (reset them)
  for (let i = count + 1; i <= oldMax; i++) {
    resetTable(i);
    delete tableState[i];
  }

  // Re-register static routes for new tables
  for (let i = oldMax + 1; i <= count; i++) {
    app.use(`/preview/${i}`, express.static(path.join(__dirname, 'tables', `table-${i}`)));
  }

  // Broadcast new state to all clients
  const states = {};
  for (const [id, state] of Object.entries(tableState)) {
    states[id] = { status: state.status, timestamp: state.timestamp };
  }
  io.emit('state-sync', { tables: states, maxTables: config.maxTables });
  console.log(`[Config] maxTables changed: ${oldMax} -> ${count}`);
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
    const dir = path.join(__dirname, 'tables', `table-${i}`);
    let debounce = null;
    fs.watch(dir, (eventType, filename) => {
      if (filename === 'index.html') {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (tableState[i].status !== 'building') {
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
  for (const controller of Object.values(activeRequests)) {
    controller.abort();
  }
  if (browser) await browser.close();
  process.exit(0);
});
