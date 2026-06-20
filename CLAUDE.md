# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
go mod tidy              # sync dependencies
go build -o chat.exe .   # compile to chat.exe
go run main.go           # run directly (no build step)
go vet ./...             # static analysis (no linter/formatter configured)
```

CLI flags: `-port 8080` (default), `-static static`, `-upload uploads`

## Architecture

Go backend + vanilla HTML/CSS/JS frontend (no build step, no npm).

- **`main.go`** — Entry point. Parses flags, prints LAN IPs + QR codes to terminal, starts HTTP server, handles graceful shutdown via SIGINT/SIGTERM.
- **`server/`** — Single Go package (4 files):
  - `server.go` — HTTP routes: `/ws` (WebSocket upgrade with HMAC token auth), `/upload` + `/upload-chunk` + `/upload-complete` (file upload), `/files/` (static file serving), `/` (SPA fallback). Contains `Server` struct with `Start()`/`Stop()` methods.
  - `hub.go` — WebSocket message hub. Manages client registry via channels (`register`/`unregister`/`broadcast`/`private`). Runs in its own goroutine. Broadcast uses RLock for iteration, then Lock for removing slow clients.
  - `client.go` — Per-client read/write pumps with ping/pong keepalive. 64MB max message size.
  - `message_store.go` — In-memory message store with dirty-flag batch flush (every 5s). Persists to `uploads/messages.json`. Max 200 messages.
- **`static/`** — Frontend: `index.html` loads highlight.js languages individually (not bundled), `style.css` with CSS variables for light/dark themes, `script.js` with WebSocket client, file upload (chunked for >4MB), image compression via Canvas.

## Key Constraints

- **WebSocket auth**: Server validates HMAC-SHA256 token on `/ws` connection. Secret is hardcoded as `chat-room-secret-2024` in both `server/server.go` and `static/script.js`. Frontend generates token via `crypto.subtle` before connecting.
- **File upload whitelist**: Only allowed extensions pass (images, videos, docs, text, archives). Server cleans filenames with `filepath.Base` to prevent path traversal.
- **Message recall**: Server verifies `msg.Username` matches the original sender before allowing recall.
- **No `uploads/` in git** — runtime directory, created at startup, gitignored.
- **Module path**: `github.com/Breedom/Chat` — use this for imports.
- **Language**: README, comments, and UI text are in Chinese. Code identifiers are English.
- **No tests, CI, or linter** configured in this repo.
