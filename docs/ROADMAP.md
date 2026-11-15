# Roadmap

## M0 — Discovery & skeleton
- Inspect the real `~/.claude`; correct `docs/DATA-SOURCES.md`. Copy anonymised samples into `test/fixtures/`.
- Hono server + Vite/React app + SQLite + `npx hangar` bin. Binds to 127.0.0.1.
- Add/remove repos (stored in `~/.hangar/config.json`).

## M1 — Config
- Adapters: settings (all layers), CLAUDE.md files, commands, agents, skills, hooks, MCP.
- **Config screen**: effective settings with source + what was overridden; per-scope tabs; permissions; hooks; MCP list.
- Token count for each CLAUDE.md.

## M2 — Sessions (passive)
- Transcript parser → normalised `SessionEvent`s. Incremental tailing (read only new bytes).
- **Session detail**: timeline with filters, files changed, context %, compactions, cost, `claude --resume <id>` copy.
- SQLite index + FTS5 search across sessions (with secret redaction).

## M3 — Live & global board (the headline feature)
- Install global hooks (consent + diff + backup) → `/hook` endpoint → SSE.
- Status model: Waiting for you / Running / Idle / Finished.
- **All sessions board** across every repo, filter by repo.
- Desktop + browser notifications when a session is waiting. Optional sound.

## M4 — Dashboard & tasks
- **Dashboard**: alert strip, today's stats, live sessions, repos with warnings, tasks across repos, recent CLAUDE.md changes (diffs from git history or Hangar's own snapshots).

## M5 — Insights
- Cost/tokens per day, per repo, per model; daily budget alert.
- Allowlist suggestions (commands approved by hand often) — clicking writes the rule after showing a diff.
- "Where Claude got stuck" (repeated failures, high context, failing MCP).
- Weekly summary of what shipped (from session titles + commits).

## M6 — CLAUDE.md linter
- Conflicts between global and project rules, stale file paths, duplicates, size warnings, suggestion to split into nested CLAUDE.md.

## M7 — Library & templates
- Every command/agent/skill/hook from all repos; "copy to repo", "make global".
- Repo templates (a `.claude/` folder + CLAUDE.md) applied with a diff preview.
- Backup `~/.claude` (minus sessions/secrets) to a private git repo with history.

## M8 — Polish
- MCP health checks, secrets scan view, keyboard shortcuts (⌘K search), light theme, README with GIF.
