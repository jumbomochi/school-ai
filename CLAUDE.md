# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Demo Platform — a workshop tool where participants at tables use Claude Code CLI to build web applications live, while a facilitator monitors progress on a real-time dashboard. Designed for 15-25 concurrent participants in educational/demo settings.

## Tech Stack

- **Backend:** Node.js + Express + socket.io (WebSocket)
- **Frontend:** Plain HTML/CSS/JS (no framework)
- **Screenshots:** Puppeteer for dashboard thumbnails
- **CLI Integration:** Spawns `claude` CLI processes per table with `--system-prompt` and `--allowedTools` flags
- **No database** — all state is file-based (table output files + in-memory process map)

## Architecture

Single Express server (`server.js`) handles:
- Participant UI at `/table/:id` — prompt input, code display, live preview iframe
- Facilitator dashboard at `/dashboard` — screenshot thumbnail grid with real-time status
- Preview serving at `/preview/:id` — static files from `tables/table-N/`
- Screenshot serving at `/screenshots/table-:id.png`

### Key Data Flow

1. Participant submits prompt → WebSocket `submit-prompt` event
2. Server spawns Claude Code CLI in `tables/table-N/` with constraints
3. Server broadcasts `status-update` (building) via socket.io
4. CLI writes `index.html` → `fs.watch` detects change → broadcasts `status-update` (done)
5. Puppeteer captures screenshot of `/preview/N` → saves to `screenshots/`

### Claude Code Constraints

Each table's CLI process is constrained via:
- `--system-prompt` flag (hard behavioral limits)
- `CLAUDE.md` in each `tables/table-N/` directory (table context, current step)
- `--allowedTools` (restricted to file write/edit)

Steps (Create → Customize → Go Wild) progressively modify the system prompt.

## Project Structure

```
server.js          — Express server entry point, WebSocket handlers, CLI process management
config.js          — All configuration (maxTables, cliTimeout, screenshotInterval, systemPrompt, port)
public/
  participant.html — Participant single-page UI
  dashboard.html   — Facilitator dashboard UI
  css/             — Stylesheets (dark theme, CSS custom properties)
  js/              — Client-side JavaScript (WebSocket handlers, UI logic)
tables/            — Generated content per table (gitignored), each with index.html
screenshots/       — Puppeteer-generated dashboard thumbnails (gitignored)
```

## Common Commands

```bash
# Install dependencies
npm install

# Start the server
node server.js

# Start with auto-reload during development
npx nodemon server.js
```

There is no build step — frontend is plain HTML/CSS/JS served statically.

## Configuration

All settings live in `config.js`: port, maxTables (default 25), cliTimeout (120s), screenshotInterval (5s), system prompt text, and allowed CLI tools.

## Key Design Decisions

- **File-based state:** Each table's output is a physical `index.html` on disk. No database. Server restart recovers state by scanning `tables/` directories.
- **One CLI process per table:** If a table submits while already building, the request is rejected (not queued).
- **Hybrid dashboard previews:** Thumbnails use Puppeteer screenshots (lightweight); clicking opens a live iframe modal.
- **No authentication:** Tables accessed by URL (`/table/7`). This is a demo platform for controlled workshop environments.
- **socket.io for real-time:** Status updates (building/done/error), screenshot refresh notifications, and full state sync on reconnect.

## Design Document

Full design with rationale: `docs/plans/2026-03-05-claude-code-demo-platform-design.md`
