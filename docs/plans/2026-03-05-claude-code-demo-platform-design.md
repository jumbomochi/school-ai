# Claude Code Demo Platform — Design

## Purpose

A workshop demo platform where participants at tables use Claude Code CLI to build web applications live. A facilitator dashboard monitors all tables with live previews and status indicators.

## Stack

Node.js + Express + socket.io + Puppeteer. Plain HTML/CSS/JS frontend (no framework).

## Architecture

Single Express server handles everything:

- **Participant UI** (`/table/:id`) — Prompt input, code display, live preview iframe
- **Facilitator Dashboard** (`/dashboard`) — Grid of screenshot thumbnails with status indicators
- **Preview serving** (`/preview/:id`) — Static file serving from each table's directory
- **Screenshots** (`/screenshots/table-:id.png`) — Puppeteer-generated thumbnails

### Process Flow

1. Participant submits prompt via WebSocket (`submit-prompt`)
2. Server spawns Claude Code CLI in `tables/table-N/` with system prompt + CLAUDE.md constraints
3. Server broadcasts `status-update` (building) to all clients
4. CLI writes `index.html` to `tables/table-N/`
5. `fs.watch` detects change → broadcasts `status-update` (done) → triggers Puppeteer screenshot
6. If CLI exits non-zero → broadcasts `status-update` (error)

### Claude Code Constraints

- `--system-prompt` flag for hard behavioral limits (only generate single-file HTML/CSS/JS, no shell commands)
- `CLAUDE.md` per table directory for context (table number, current step)
- `--allowedTools` to restrict to file write/edit only
- Steps (Create/Customize/Go Wild) modify the system prompt to progressively unlock capabilities

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `submit-prompt` | Client → Server | `{ table, prompt, step }` |
| `status-update` | Server → All | `{ table, status, timestamp }` |
| `screenshot-ready` | Server → Dashboard | `{ table, url }` |
| `reset-table` | Dashboard → Server | `{ table }` or `{ all: true }` |

### Session Resilience

- State is file-based: `tables/table-N/index.html` persists on disk
- On server restart: scan table directories, set status to "done" if index.html exists, "idle" if empty
- In-flight CLI processes lost on crash (acceptable for demo)
- socket.io auto-reconnects; server sends full state sync on reconnect

## Configuration

All in `config.js`:

- `maxTables`: 25 (default)
- `cliTimeout`: 120000ms
- `screenshotInterval`: 5000ms
- `systemPrompt`: base constraint prompt
- `allowedTools`: ['write', 'edit']
- `port`: 3000

## UI

### Participant View

- Left panel (30%): prompt textarea, Send button, collapsible code panel with character count
- Right panel (70%): live iframe pointing to `/preview/:id`
- Header: table number, app title, step buttons (Create/Customize/Go Wild)
- Dark theme, monospace code display with syntax highlighting (Prism.js)

### Facilitator Dashboard

- Header: title, status counters (Done/Building/Active), Reset All button
- Responsive grid (5 columns): screenshot thumbnails as `<img>` tags
- Each card: thumbnail, table label, status dot (green/yellow/red/gray)
- Click thumbnail → modal with live iframe
- Per-table reset via X button on card

## Project Structure

```
school-ai/
├── server.js
├── package.json
├── config.js
├── public/
│   ├── participant.html
│   ├── dashboard.html
│   ├── css/
│   └── js/
├── tables/          (gitignored)
├── screenshots/     (gitignored)
└── docs/plans/
```

## Constraints

- 15-25 concurrent tables
- One CLI process per table at a time (reject if already building)
- 120s timeout per build
- No authentication — URL-based table access
- Local-first, deployable to cloud
