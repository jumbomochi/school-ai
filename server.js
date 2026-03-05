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
  if (tableState[id]?.process) {
    tableState[id].process.kill('SIGTERM');
    tableState[id].process = null;
  }

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
  for (const state of Object.values(tableState)) {
    if (state.process) state.process.kill('SIGTERM');
  }
  if (browser) await browser.close();
  process.exit(0);
});
