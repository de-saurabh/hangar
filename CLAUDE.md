# Hangar (working name)

A lightweight, local dashboard for Claude Code. Add your repos once, and Hangar shows — in a clean web UI — what is happening at the Claude level across all of them: live sessions and their status, config, CLAUDE.md files, tasks, cost, and reusable commands/agents/skills/hooks. No more digging through the terminal and dotfiles.

Personal project, open source. Runs with one command (`npx hangar`), no account, no cloud.

## Who you're working with

- The owner is an experienced **Node.js** developer and a heavy Claude Code user who often runs **several sessions at once**.
- Prefers **short, direct explanations**.

## Non-negotiable principles

1. **Read-only by default.** Hangar never modifies `~/.claude`, `~/.claude.json` or any repo's `.claude/` / `CLAUDE.md` unless the user clicks an explicit action. Every write shows a diff first and makes a backup.
2. **Local and private.** Bind to `127.0.0.1` only. No telemetry, no network calls except to optional MCP health checks the user triggers. Transcripts can contain secrets — never log or send them anywhere.
3. **Verify, don't assume, file formats.** Claude Code's on-disk layout changes between versions. Every parser lives behind an adapter, tolerates unknown fields, and fails soft (show "couldn't read X" in the UI, never crash). See `docs/DATA-SOURCES.md`.
4. **Live.** File watching + hooks → server-sent events → UI updates within a second.
5. **Lightweight.** Fast startup, small install, low idle CPU. No Electron, no database server.

## Stack (decided)

| Area | Choice |
|---|---|
| Runtime | Node 20+, TypeScript |
| Server | Express 5 — REST + SSE |
| UI | Vite + React + TanStack Query + TanStack Router; Tailwind + shadcn/ui; Recharts; cmdk (⌘K); react-diff-viewer-continued; built into static files served by the server |
| Repo layout | pnpm workspaces: `packages/shared` (types, status reducer, price table, zod schemas), `packages/server`, `packages/web`. Published as one npm package that bundles all three |
| Parsing | `zod` (tolerant: passthrough + safeParse), `jsonc-parser`, `gray-matter`, `remark`/`unified` (CLAUDE.md linter), `diff` |
| Search | MiniSearch (in-memory) until a real index is needed |
| Live status | Claude Code `http` hooks (POST to `127.0.0.1`), `~/.claude/sessions/<pid>.json` registry, transcript tailing as fallback — see `docs/DATA-SOURCES.md` |
| Storage | No database for now (M0–M1): config and preferences are JSON files in `~/.hangar/`. A cache/search index is decided in M2 after measuring real transcripts; it will only ever be a cache — the source of truth is always the files on disk |
| Watching | `chokidar` |
| Desktop alerts | `toasted-notifier` (maintained fork of `node-notifier`), plus browser Notification API when the tab is open |
| Tests | Vitest, with fixture copies of `~/.claude` structures in `test/fixtures/` |
| Distribution | npm package with a `bin` → `npx hangar` opens the browser |

## Design

Reference screens in `docs/design/` (see its README). Dark developer theme: background `#0E1014`, surfaces `#161920`, borders `#262A33`, text `#E7E9EE` / muted `#A0A7B4`, accent `#8AB4FF`; status colours: running `#4ADE80`, waiting `#FBBF24`, error `#F87171`, compacted/finished `#C4B5FD`. Fonts: Inter + JetBrains Mono.

## Conventions

- `packages/server/src/sources/` — one adapter per data source (settings, CLAUDE.md, sessions, live registry, MCP, plugins, commands/agents/skills, hooks). Each exports `discover()`, `read()`, `watch()` and has fixture tests.
- `packages/shared/src/model/` — normalised types the UI uses (Session, SessionEvent, Repo, SettingValue with `source`, Task, LintFinding…).
- `packages/server/src/server/` — Express routes + SSE bus.
- `packages/web/` — React app.
- Never read `~/.claude/.credentials.json` or `~/.claude/sessions/*.key`.
- Small commits, one per roadmap step.
