# Design reference

Live, clickable canvas: https://claude.ai/artifact/NMsaJ9ZcjgdgpcdfPDRCfN (private to the owner).

The `.dc.html` files are the source of each screen. They use a design-canvas runtime, so they **won't render on their own** — read them for layout, copy, states and sample data. The `<script>` block at the bottom of each holds the data and interaction logic.

| File | Screen | Route |
|---|---|---|
| `Main.dc.html` | Dashboard: waiting alert, today's stats, live sessions, repos, tasks, CLAUDE.md changes | `/` |
| `Sessions.dc.html` | **All sessions** — global live board by status (Waiting / Running / Idle / Finished), repo filter, desktop-alert toggle | `/sessions` |
| `Session.dc.html` | Session detail: filterable timeline, context, files changed, task list, resume command | `/sessions/:id` |
| `Config.dc.html` | Effective config by scope, permissions, hooks, MCP health, CLAUDE.md files + linter | `/repos/:id/config` |
| `Insights.dc.html` | Cost/tokens per day and repo, allowlist suggestions, weekly summary, where Claude got stuck | `/insights` |
| `Library.dc.html` | Commands, agents, skills, hooks across repos; templates; backup | `/library` |

Sample data in these files is invented for the mockups.
