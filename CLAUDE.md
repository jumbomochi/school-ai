# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Demo Platform — a workshop tool where participants at tables use an LLM to build web applications live, while a facilitator monitors progress on a real-time dashboard. Designed for 15-25 concurrent participants in educational/demo settings.

## Tech Stack

- **Backend:** Node.js + Express + socket.io (WebSocket)
- **Frontend:** Plain HTML/CSS/JS (no framework)
- **LLM:** Ollama (local, default model: `qwen2.5-coder:14b`)
- **Screenshots:** Puppeteer for dashboard thumbnails
- **No database** — all state is file-based (table output files + in-memory request map)

## Architecture

Single Express server (`server.js`) handles:
- Participant UI at `/table/:id` — prompt input, streaming code display, live preview iframe
- Facilitator dashboard at `/dashboard` — screenshot thumbnail grid with real-time status, dynamic table count control
- Preview serving at `/preview/:id` — static files from `tables/table-N/`
- Screenshot serving at `/screenshots/table-:id.png`

### Key Data Flow

1. Participant submits prompt → WebSocket `submit-prompt` event
2. Server sends streaming request to Ollama API (`/api/generate` with `stream: true`)
3. Server broadcasts `status-update` (building) + streams `code-stream` events as tokens arrive
4. On completion, server extracts HTML, writes `index.html` to `tables/table-N/`
5. Puppeteer captures screenshot → broadcasts `screenshot-ready`

### System Prompts

Quality-enforcing system prompts in `config.js` ensure all generated websites meet a high visual bar (multi-section layouts, Google Fonts, gradients, animations, responsive design). Three step-specific prompts:
- **Create** — Build from scratch based on user description
- **Customize** — Modify existing HTML (fed back as context)
- **Go Wild** — Transform with advanced effects (particles, parallax, 3D transforms)

## Project Structure

```
server.js          — Express server, socket.io handlers, Ollama streaming, Puppeteer screenshots
config.js          — Configuration: Ollama URL/model, timeouts, system prompts with quality rules
public/
  participant.html — Participant single-page UI
  dashboard.html   — Facilitator dashboard UI
  css/             — Stylesheets (dark theme, CSS custom properties)
  js/              — Client-side JS (socket.io handlers, streaming, grid management)
tables/            — Generated content per table (gitignored), each with index.html
screenshots/       — Puppeteer-generated dashboard thumbnails (gitignored)
```

## Common Commands

```bash
# Install dependencies
npm install

# Start the server (requires Ollama running at localhost:11434)
npm start

# Start with auto-reload during development
npm run dev

# Use a different port or model
PORT=3001 npm start
OLLAMA_MODEL=qwen2.5-coder:32b npm start
```

There is no build step — frontend is plain HTML/CSS/JS served statically.

## Configuration

All settings in `config.js`:
- `port` — server port (default: 3000, overridable via `PORT` env var)
- `maxTables` — number of participant tables (default: 25, adjustable at runtime from dashboard)
- `ollamaUrl` — Ollama API endpoint (default: `http://localhost:11434`)
- `ollamaModel` — model name (default: `qwen2.5-coder:14b`)
- `requestTimeout` — max generation time per request (default: 180s)
- `systemPrompts` — quality-enforcing prompts per step (create/customize/go-wild)

## Key Design Decisions

- **Ollama for LLM:** Local inference, no API keys needed. Model configurable via env var. Streaming enabled for real-time code display.
- **File-based state:** Each table's output is a physical `index.html` on disk. No database. Server restart recovers state by scanning `tables/` directories.
- **One request per table:** If a table submits while already building, the request is rejected (not queued).
- **Hybrid dashboard previews:** Thumbnails use Puppeteer screenshots (lightweight); clicking opens a live iframe modal.
- **Dynamic table count:** Facilitator can change the number of tables at runtime from the dashboard.
- **No authentication:** Tables accessed by URL (`/table/7`). This is a demo platform for controlled workshop environments.
- **Streaming:** Ollama response streams via socket.io `code-stream` events so participants see code appearing in real-time.
