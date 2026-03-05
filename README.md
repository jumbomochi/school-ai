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
