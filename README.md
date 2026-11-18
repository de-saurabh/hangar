# Hangar

A lightweight, local dashboard for [Claude Code](https://claude.com/claude-code). Add your repos once, and Hangar shows what is happening at the Claude level across all of them: live sessions and their status, config, CLAUDE.md files, tasks, cost, and reusable commands, agents, skills and hooks.

No account, no cloud, no telemetry. It runs on `127.0.0.1` only.

<!-- TODO: add a short GIF of the dashboard here (docs/media/hangar.gif). -->

```sh
npx hangar          # opens http://localhost:4777
npx hangar --port 5000 --no-open
```

Needs Node 20+.

## What you get

| Screen | What it does |
|---|---|
| **Dashboard** | Live sessions grouped by status, "waiting for you" alerts, tasks across repos, today's cost, CLAUDE.md changes |
| **Sessions** | Every session with search, a readable timeline, files changed, cost and context use |
| **Insights** | Cost and tokens per day, by repo and model, a daily budget, allowlist suggestions, where Claude got stuck, what shipped this week |
| **Library** | Commands, agents, skills and hooks from all repos; copy to a repo or make global; repo templates; local backup of your `~/.claude` |
| **Config** | Effective settings with the scope each value comes from, permissions, hooks, MCP servers, CLAUDE.md files with a linter, a secrets check |

Also: ⌘K / Ctrl+K to jump anywhere, desktop and browser notifications when a session needs you, and a light theme.

## Principles

- **Read-only by default.** Hangar never changes `~/.claude`, `~/.claude.json` or a repo's `.claude/` / `CLAUDE.md` unless you click an explicit action. Every write shows a diff first, needs a token for exactly that diff, and backs up what it overwrites (`~/.hangar/backups`).
- **Local and private.** Binds to `127.0.0.1`. No telemetry. The only outbound request Hangar can make is an MCP health check you click, and it sends no credentials. Transcripts are parsed in memory; prompts and tool output are never logged, and secret-looking values are redacted before they reach the browser.
- **Fails soft.** Claude Code's on-disk formats change between versions. Parsers tolerate unknown fields and show "couldn't read X" instead of crashing. See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) for what is verified and what is not.
- **Never reads** `~/.claude/.credentials.json` or `~/.claude/sessions/*.key`.

## Live status (optional)

Without setup, Hangar infers busy/idle from files. To know the moment a session is **waiting for you** and what it wants to run, enable hooks from the banner on the Sessions page. You get a diff of the exact change to `~/.claude/settings.json` first; the hooks POST small events to `127.0.0.1` and never block Claude if Hangar is closed. You can remove them from the same dialog.

## Known limits

- Cost per day is an estimate (transcripts carry no per-day cost).
- Allowlist suggestions rely on hook events verified in headless runs; an interactive approval has not been observed yet.
- Task lists come from `TodoWrite`-style tool calls; the exact shapes are tolerant guesses.
- Plugin-contributed commands, agents and hooks, managed-settings paths and `@path` imports in CLAUDE.md are not covered yet.

## Development

```sh
pnpm install
pnpm dev          # server + web with reload
pnpm test         # vitest
pnpm typecheck
pnpm build        # builds the web app and bundles it with the server
```

pnpm workspaces: `packages/shared` (types, session reducer, zod schemas), `packages/server` (Express 5, REST + SSE, one adapter per data source), `packages/web` (Vite + React + TanStack). Design references live in `docs/design/`, the plan in [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT
