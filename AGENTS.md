# AGENTS.md

## Build & Run

```bash
go mod tidy          # sync dependencies
go build -o chat.exe .   # compile
go run main.go       # run directly (no build step needed)
```

No tests, linter, formatter, or typecheck commands exist in this repo. `go vet ./...` is the only reasonable static check if needed.

## CLI Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `-port` | `8080` | Server listen port |
| `-static` | `static` | Static files directory (must exist) |
| `-upload` | `uploads` | Upload directory (created automatically) |

## Architecture

- **`main.go`** — Entry point. Parses flags, prints LAN IPs + QR codes, starts server.
- **`server/`** — Single Go package with 4 files:
  - `server.go` — HTTP routes (`/ws`, `/upload`, `/files/`, `/`). Uses `gorilla/websocket`.
  - `hub.go` — WebSocket message hub. Manages client registry, broadcasts messages.
  - `client.go` — WebSocket read/write pumps per client. 64MB message limit.
  - `utils.go` — Trivial `createFile`/`copyFile` wrappers.
- **`static/`** — Frontend: `index.html`, `style.css`, `script.js` (vanilla, no build step).
- **`uploads/`** — Runtime directory for uploaded files (gitignored).

## Key Constraints

- **No `uploads/` in git** — it's gitignored and created at runtime. Don't commit it.
- **WebSocket upgrader allows all origins** (`CheckOrigin` returns `true`).
- **Upload max**: 32MB (server-side `ParseMultipartForm`), 64MB (WebSocket `maxMessageSize`).
- **Module path**: `github.com/Breedom/Chat` — use this for imports.
- **Go version**: `go 1.26.4` per `go.mod`.
- **Language**: README and comments are in Chinese. Code identifiers are English.
