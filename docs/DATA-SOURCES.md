# Data sources

Verified on 2026-11-15 against Claude Code **2.1.325**, Windows 11 (`pidDomain: win32:zephyr`), by inspecting the owner's real `~/.claude` (key names only, no content read). Layouts change between versions, so every adapter must tolerate unknown fields and missing files.

Legend: ✅ verified on disk · ❓ not seen yet / unverified · ❌ differs from the original assumption.

| What | Where | Status | Notes |
|---|---|---|---|
| Global settings | `~/.claude/settings.json` | ✅ | Seen keys: `model`, `effortLevel`, `autoUpdatesChannel`, `theme`, `modelSettings`. No `hooks`/`permissions` yet on this machine. |
| Project settings | `<repo>/.claude/settings.json` | ❓ | Per official hooks docs. Not present in any repo here. |
| Local settings | `<repo>/.claude/settings.local.json` | ❓ | Per official docs. |
| Managed settings | OS-specific | ❓ | `C:\Program Files\ClaudeCode` and `C:\ProgramData\ClaudeCode` do not exist here. Confirm the real path in the settings docs. |
| Global memory | `~/.claude/CLAUDE.md` | ❓ | Not present on this machine. |
| Repo memory | `<repo>/CLAUDE.md`, nested `**/CLAUDE.md`, `CLAUDE.local.md` | ❓ | Repo-level file confirmed in this repo. |
| Commands / agents | `~/.claude/commands/`, `~/.claude/agents/` | ❓ | Neither directory exists here. Treat absence as normal. |
| Skills | `~/.claude/skills/` | ✅ dir exists | Contains `synced/`; layout of skill folders still to inspect. |
| Plugins | `~/.claude/plugins/` | ✅ new | `known_marketplaces.json`, `marketplaces/`, `plugin-directory-cache-v2.json`, `synced/`. Plugins can contribute commands, agents, skills and hooks. Add a plugin adapter. |
| MCP servers | `~/.claude.json` → `mcpServers` (user) and `projects[<path>].mcpServers` (local); `<repo>/.mcp.json` (project) | ✅ | `projects` keys use **forward slashes with a drive letter** (`D:/Documents/...`): match loosely. `projects[<path>]` also has `enabledMcpjsonServers`/`disabledMcpjsonServers` (approval state of `.mcp.json` servers; semantics inferred). Server entries: `type`, `command`, `args`, `env`, `url`, `headers`. **`env`, `headers`, `args` and URL queries can hold tokens: Hangar keeps only names/counts.** `~/.claude.json` also holds account data (`oauthAccount`, ...): never return anything else from it. ❓ With `CLAUDE_CONFIG_DIR` set, `.claude.json` is assumed to live inside that dir. ❓ Plugin-provided and claude.ai connector servers are not read yet. |
| Per-project stats | `~/.claude.json` → `projects[<path>]` | ✅ new | Keys: `lastCost`, `lastDuration`, `lastTotalInputTokens`, `lastTotalOutputTokens`, `lastTotalCache*Tokens`, `lastLinesAdded/Removed`, `lastModelUsage`, `lastSessionId`, `hasTrustDialogAccepted`. Only the *last* session, so not enough for Insights. |
| Session transcripts | `~/.claude/projects/<encoded-path>/<session-id>.jsonl` | ✅ | See "Transcripts" below. |
| Live session registry | `~/.claude/sessions/<pid>.json` | ✅ new | See "Live registry" below. Strong liveness and status source. |
| Task lists | ❌ `~/.claude/todos/` does not exist | ❌ | Tasks appear in transcripts (`tools-used`, `TaskCreated`/`TaskCompleted` hook events). Find where tasks are stored in M2. |
| Plans | `~/.claude/plans/<name>.md` | ✅ | Randomly named markdown files. |
| Per-project memory | `~/.claude/projects/<encoded-path>/memory/*.md` (+ `MEMORY.md` index) | ✅ new | Auto-memory files. Candidate for a "Memory" view. |
| Prompt history | `~/.claude/history.jsonl` | ✅ new | Contains user prompts. Do not index without redaction. |
| Other | `file-history/`, `session-env/`, `shell-snapshots/`, `paste-cache/`, `backups/`, `cache/`, `downloads/`, `ide/`, `chrome/` | ✅ exist | Ignore for now. |
| Credentials | `~/.claude/.credentials.json`, `~/.claude/sessions/*.key` | ✅ exist | **Never read, never log.** Add to an explicit denylist in the file reader. |

## Project directory encoding

`D:\Documents\Dev Work\Repos\10. Recruiter` → `D--Documents-Dev-Work-Repos-10--Recruiter`. Every non-alphanumeric character becomes `-`. This is **lossy**, so never decode it. Read the real path from the `cwd` field inside the transcript, or from the `projects` keys in `~/.claude.json`.

## Transcripts

One JSON object per line. A 290-line session contained these `type` values: `user`, `assistant`, `attachment`, `system` (subtypes `local_command`, `turn_duration`), `custom-title`, `agent-name`, `mode`, `permission-mode`, `session-owner`, `last-prompt`, `tools-used`, `file-history-snapshot`, `file-history-delta`, `atis-latch`, `api-request`, `api-request-shape`, `api-request-blob`. Expect more types in other sessions. **Unknown types must be skipped, not fatal.**

- Common fields on conversation lines: `uuid`, `parentUuid`, `isSidechain`, `timestamp`, `sessionId`, `cwd`, `gitBranch`, `version`, `entrypoint`.
- `assistant.message`: `model`, `id`, `role`, `content[]` (block types seen: `tool_use`), `stop_reason`, `usage`.
- `usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, plus `cache_creation`, `server_tool_use`, `service_tier`, `speed`, `iterations`.
- `system/turn_duration`: `durationMs`, `messageCount` (useful for "turn finished").
- `custom-title` and `agent-name` repeat, so the **last** one wins for the session title.
- `api-request*` lines are large and may duplicate prompt content. Skip them when indexing.
- Sidechains (`isSidechain: true`) are subagent turns. Decide in M2 whether to fold into the parent.
- Transcripts may contain secrets. Redact before indexing.
- **Survey of all transcripts on the dev machine (M2 prep):** 7 files, 50 MB total, largest 29 MB, longest line 569 KB, 18.7k lines, 0 unparseable, 0 sidechain lines, no `subagents/` dirs. Verdict: **no database needed**; parse files, cache a summary per file keyed by size+mtime, tail incrementally.
- **More line types seen:** `ai-title` (`aiTitle`), `custom-title` (`customTitle`, user-set; wins over ai-title), `cost-state`, `system/compact_boundary`, `system/informational`, `queue-operation`, `bridge-session`, `frame-link`, `artifact-*`. Attachment subtypes include `total_tokens_reminder`, `task_reminder`, `task_status`, `edited_text_file`, `nested_memory`, `hook_system_message`, `plan_mode`.
- **Cost (authoritative):** `cost-state` lines carry `totalCostUSD`, `totalAPIDuration`, `totalToolDuration`, `totalDuration`, `totalLinesAdded`, `totalLinesRemoved`, `startTime`, `hasUnknownModelCost` and `modelUsage[model]` (`inputTokens`, `outputTokens`, `thinkingTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `costUSD`). Use the **last** one per session; fall back to `usage` x price table only when absent. Resumed sessions may continue the same totals (unverified).
- **Compaction:** `system/compact_boundary` with `compactMetadata`: `trigger`, `preTokens`, `postTokens`, `cumulativeDroppedTokens`, `durationMs`. The following `user` line has `isCompactSummary: true` (huge text; never index or show). Seen: 393336 -> 8583 tokens, so the context window can exceed 200k.
- **Context size at a point:** last assistant `usage`: `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. The window size is not in the transcript; infer (200k default, larger if a compaction `preTokens` exceeds it) and label as estimate.
- **Tools seen:** Bash, PowerShell, Read, Edit, Write, Glob, Grep, Skill, ToolSearch, WebFetch, WebSearch, AskUserQuestion, ExitPlanMode, TaskStop, Artifact, and `mcp__<server>__<tool>`. File edits: `user` lines with `toolUseResult.filePath` + `structuredPatch`. Tool results: `user` lines with `tool_result` blocks (`tool_use_id`, `is_error`).
- **Resumed sessions replay history.** A resumed session file contains older messages (timestamps before the run started); `cost-state.startTime` marks the current run. Count usage only from that start to match reported numbers. Sessions that are still live have **no `cost-state` yet** (it is written later), so their cost is unknown until an estimate is added (M5).
- **Accuracy of transcript-derived tokens vs reported (`cost-state`), 4 real sessions:** output within about 3-25% (reported `outputTokens` excludes `thinkingTokens`, the API's `output_tokens` includes them), cache creation within 0-35%, cache reads within 9-15%, **non-cached input far lower in the transcript** (Claude Code makes side requests such as compaction summaries that never appear as assistant lines). Treat transcript totals as approximate; prefer reported cost.
- **Performance (real data):** parse + reduce 16 MB in about 70 ms, 29 MB in about 125 ms.
- **One assistant line per content block**, all sharing `message.id` with the same `usage`: count usage once per message id.
- ❓ **Task lists:** still not located. `task_reminder` attachments have `content[]` + `itemCount` (empty in the sample); inspect one with items in M4.

## Live registry (`~/.claude/sessions/<pid>.json`)

Written by each running interactive Claude Code process. Fields: `pid`, `sessionId`, `cwd`, `startedAt`, `procStart`, `version`, `kind` (seen: `interactive`), `entrypoint` (seen: `cli`), `pidDomain`, `name`, `nameSource` (`auto` | `user`), `status`, `updatedAt`, `statusUpdatedAt`, plus `peerProtocol`, `peerFeatures`, `messagingSocketPath`.

- `status` values seen: `idle`, `busy`. ❓ Whether a waiting-for-approval value exists: not observed. Test by leaving a session at a permission prompt.
- Process liveness: `process.kill(pid, 0)` confirmed both entries alive. Combine with `procStart` to guard against PID reuse. Stale files for dead PIDs should be ignored (and are probably removed by Claude Code, unverified).
- Not an official, documented interface. Treat as best-effort, behind the adapter.
- `*.key` files beside them are secrets. Do not read.

## Precedence for "effective config"

Managed > command-line (`--settings`) > Local > Project > User (global). Source: official hooks docs, which say managed settings take priority and `--settings` overrides project and local. ❓ Confirm the full order in the settings docs before building the Config screen. Hook entries merge across scopes and identical handlers run once.

## Session status: how to know it

Use three signals, in this order of trust:

1. **Hooks (authoritative, when installed).** Official docs list an `http` handler type: Claude Code POSTs the hook input JSON to a URL. A non-2xx response or a refused connection is non-blocking by default, so nothing breaks when Hangar is not running. Payloads include `session_id`, `transcript_path`, `cwd`, `hook_event_name`. Relevant events: `Notification` (`notification_type`: `permission_prompt`, `idle_prompt`, `elicitation_dialog`, `agent_needs_input`, `agent_completed`, …), `PermissionRequest`, `Stop`, `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `PreCompact`, `PostCompact`, `TaskCreated`, `TaskCompleted`. ❓ Capture a real payload for each before writing the schema (M0 task). ❓ `onFailure` is noted as v2.1.295+; our version qualifies. ❓ Whether a failing hook adds latency per tool call: measure.
2. **Live registry (passive, no install needed).** `sessions/<pid>.json` gives `status` (`idle`/`busy`), liveness and the session name for free. This may cover most of the board without hooks at all.
3. **Transcript tailing (fallback and history).** Last event time and type. Ambiguous for "waiting vs. running a long command", so only use timeouts when neither of the above applies.

Model status as an explicit reducer (`working`, `waiting`, `idle`, `finished`) in `packages/shared`, fed by all three sources. Prior art for the fallback timings: claude-code-ui (5 s pending tool use → approval, 60 s no turn-end → waiting for input, 5 min → idle). Take the ideas, not the code (licence unverified).

## Cost

Compute from `usage` in `assistant` lines × a price table per model (one file, easy to update), pricing cache read and cache creation tokens separately. Label it "estimated". Seed prices from LiteLLM's public price file, bundled as a snapshot so Hangar never needs network access. Cross-check against `ccusage` on real data as a test. `~/.claude.json` `projects[*].lastModelUsage` is a cheap sanity check for the latest session.

## Secrets

**What the API masks by default (implemented):** `env.*` settings whose name looks secret (token, secret, password, api key, credential, private key, auth), any settings value matching a known token format (Anthropic/OpenAI/GitHub/AWS/Slack/Google keys, JWTs, private keys, bearer tokens), and tokens/`KEY=value` assignments inside hook commands. Masked values reach the browser only through an explicit Reveal click (`GET /api/repos/:id/settings/value`, uncached), are never put in the query cache, and auto-hide after 30 s. MCP `args`, `env` values, `headers` and URL credentials/queries are never returned at all. Detection is heuristic: it will miss secrets with unusual formats and shouldn't be treated as a guarantee.

Before indexing transcripts for search, redact common secret patterns (API keys, tokens, `.env` values). Provide a "Secrets scan" view listing where they were found. Maintain a denylist of files that are never read (`.credentials.json`, `*.key`, `history.jsonl` until redaction exists).

## Open M0 checks

- [ ] Capture real hook payloads (needs a throwaway HTTP listener plus a test hook; ask before touching `settings.json`).
- [ ] Observe a `waiting` status in `sessions/*.json`.
- [ ] Find a compaction marker in a long transcript.
- [ ] Find where task lists live.
- [ ] Inspect a skill folder and a plugin's contributed commands/agents.
- [ ] Confirm managed-settings path and full precedence from the docs.
