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
- ~~SQLite index~~ **No DB (measured):** parse + reduce takes about 125 ms for a 29 MB transcript, so sessions are indexed in memory and tailed incrementally. Cross-session search (MiniSearch, with secret redaction) is still to do.
- **Done:** reducer (shared), incremental reader, SessionIndex, `/api/sessions`, Sessions list + Session detail screens (polling every 5 s until SSE in M3).
- **Not yet:** search, task list panel (storage not located), cost estimate for live sessions (no `cost-state` until the run ends), subagent transcripts.

## M3 — Live & global board (the headline feature)
**Status:** built and tested against fixtures and fake hook events; **not yet exercised by a real Claude Code session** (see DATA-SOURCES "Open checks").
- Done: status reducer, registry adapter, `POST /api/hook`, SSE (`/api/events`), hook installer with diff + backup + token check + uninstall, board UI, desktop (toasted-notifier) and browser alerts, `/api/prefs`.
- Not done: sound, per-repo alert rules, installing hooks per repo (global only), auto-detecting a port change after install.
- Install global hooks (consent + diff + backup) → `/hook` endpoint → SSE.
- Status model: Waiting for you / Running / Idle / Finished.
- **All sessions board** across every repo, filter by repo.
- Desktop + browser notifications when a session is waiting. Optional sound.

## M4 — Dashboard & tasks
- **Dashboard**: alert strip, today's stats, live sessions, repos with warnings, tasks across repos, recent CLAUDE.md changes (diffs from git history or Hangar's own snapshots).

**Status:** built and verified against synthetic data in the browser and tests.
- Done: dashboard API + screen; repo warnings (CLAUDE.md over 4k tokens, broad allow rules); CLAUDE.md changes from git history; task lists from transcripts; task panel on the session page.
- **Tasks are unverified against real data:** no TodoWrite/TaskCreate appears in the surveyed transcripts, so the shapes are tolerant guesses. Confirm when a real session uses them.
- Not done: Hangar-snapshot fallback for CLAUDE.md changes in non-git repos, per-day token/cost accounting (today's numbers are per session active today), budget line from the mockup.

## M5 — Insights (done)
- Cost/tokens per day, per repo, per model; daily budget alert.
- Allowlist suggestions (commands approved by hand often) — clicking writes the rule after showing a diff.
- "Where Claude got stuck" (repeated failures, high context, failing MCP).
- Weekly summary of what shipped (from session titles + commits).

## M6 — CLAUDE.md linter (done)
- Conflicts between global and project rules, stale file paths, duplicates, size warnings, suggestion to split into nested CLAUDE.md.

## M7 — Library & templates (done)
- Every command/agent/skill/hook from all repos; "copy to repo", "make global".
- Repo templates (a `.claude/` folder + CLAUDE.md) applied with a diff preview.
- Backup `~/.claude` (minus sessions/secrets) to a private git repo with history.

## M8 — Polish (done, except GIF)
- MCP health checks, secrets scan view, keyboard shortcuts (⌘K search), light theme, README with GIF.

### M5 notes
- Cost per day is an **estimate**: transcripts have no per-day cost, so a session's reported total is spread over its messages by relative token price; running sessions use the same model's observed rate.
- Allowlist suggestions need hooks enabled (PermissionRequest followed by the same call's PostToolUse = approved by hand). Payload order verified with real Claude Code (PermissionRequest then PostToolUse only if approved; see DATA-SOURCES.md); an interactive approval is still unconfirmed. Counters live in `~/.hangar/approvals.json` (rule + cwd only). Repo rules are written to `.claude/settings.local.json`, global to `~/.claude/settings.json`, always diff → token → backup.
- Weekly "shipped" is deterministic (session titles + git subjects), no LLM.

### M6 notes
- Heuristics only (plain line parsing, fence-aware; no remark): stale backticked paths, broken `@imports`, repeated lines, always/never contradictions, large files/sections. Findings say "may"; read-only (no auto-fix).
- Conflict detection only matches same-subject "always X" vs "never/don't X"; paraphrases are missed by design.

### M7 notes
- Library lists commands (`commands/**/*.md`, namespaced by folder), agents (`agents/*.md`), skills (`skills/<name>/SKILL.md`, skipping the app-managed `skills/synced`) and hooks, from `~/.claude` and every registered repo. Skill layout verified on disk; commands/agents layout follows the Claude Code docs (neither folder exists on the dev machine). Plugin-contributed items are not listed yet.
- Copy / make global: diff per file → token → backup of anything overwritten. Skills copy as a folder (text files only, max 50 files). Hooks are listed, not copyable (copying one means editing settings.json).
- Templates are built in (Node service, Learning project); existing files are never overwritten. Deliberately no hook in them: the hook input format for file edits is unverified.
- Backup is a **local** git repo (`~/.hangar/claude-backup`), written only on "Back up now". settings.json is stored with `env` values and token-like strings masked, so it is for history, not restore. Nothing is pushed anywhere.

### M8 notes
- ⌘K palette (pages, repo configs, sessions), light/dark/auto theme (all colours are tokens), secrets check (file/line/kind only), MCP health check (click only; HTTP = one header-only GET with no credentials, stdio = PATH lookup, never started).
- README has a placeholder for the GIF; it still needs recording from a real run.
