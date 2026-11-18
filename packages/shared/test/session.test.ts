import { describe, expect, it } from 'vitest'
import { applyLine, createSessionState, MAX_EVENTS, summarize, type SessionState } from '../src/index'

const T = (n: number) => `2026-01-01T10:00:${String(n).padStart(2, '0')}.000Z`
const base = { cwd: 'C:\\code\\demo', gitBranch: 'main', version: '9.9.9', entrypoint: 'cli' }

const prompt = (text: string, n: number, extra: object = {}) => ({ type: 'user', uuid: `u${n}`, timestamp: T(n), message: { role: 'user', content: text }, ...base, ...extra })
const toolUse = (id: string, name: string, input: object, n: number, msgId = `m${n}`, usage?: object) => ({
  type: 'assistant', uuid: `a${n}`, timestamp: T(n), ...base,
  message: { id: msgId, model: 'claude-test', content: [{ type: 'tool_use', id, name, input }], ...(usage ? { usage } : {}) },
})
const toolResult = (id: string, n: number, opts: { isError?: boolean; text?: string; result?: object } = {}) => ({
  type: 'user', uuid: `r${n}`, timestamp: T(n), ...base,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: opts.isError, content: opts.text ?? 'ok' }] },
  ...(opts.result ? { toolUseResult: opts.result } : {}),
})

function run(lines: unknown[], keepEvents = true): SessionState {
  const s = createSessionState('sess-1', { keepEvents })
  for (const l of lines) applyLine(s, l)
  return s
}

describe('titles and prompts', () => {
  it('prefers custom title, then ai title, then the first prompt', () => {
    expect(summarize(run([prompt('Add rate limiting to the API', 1)]))).toMatchObject({ title: 'Add rate limiting to the API', titleSource: 'prompt' })
    expect(summarize(run([prompt('x', 1), { type: 'ai-title', aiTitle: 'AI title' }]))).toMatchObject({ title: 'AI title', titleSource: 'ai' })
    expect(summarize(run([{ type: 'ai-title', aiTitle: 'AI title' }, { type: 'custom-title', customTitle: 'Mine' }, { type: 'custom-title', customTitle: 'Renamed' }]))).toMatchObject({ title: 'Renamed', titleSource: 'custom' })
    expect(summarize(run([]))).toMatchObject({ title: 'Untitled session', titleSource: 'none' })
  })

  it('records prompts as YOU events and skips meta and tool-result-only user lines', () => {
    const s = run([prompt('hello', 1), prompt('meta stuff', 2, { isMeta: true }), toolResult('t1', 3)])
    expect(s.events.map((e) => [e.kind, e.label, e.text])).toEqual([['prompt', 'YOU', 'hello']])
    expect(summarize(s).prompts).toBe(1)
  })

  it('collects session facts from lines and tracks the time range', () => {
    const sum = summarize(run([prompt('a', 5), prompt('b', 2)]))
    expect(sum).toMatchObject({ id: 'sess-1', cwd: base.cwd, gitBranch: 'main', version: '9.9.9', entrypoint: 'cli', startedAt: T(2), lastEventAt: T(5) })
  })
})

describe('tools', () => {
  it('turns tool_use blocks into labelled events', () => {
    const s = run([
      toolUse('t1', 'Read', { file_path: 'src/a.ts' }, 1),
      toolUse('t2', 'Bash', { command: 'npm test' }, 2),
      toolUse('t3', 'Grep', { pattern: 'TODO', path: 'src' }, 3),
      toolUse('t4', 'mcp__github__create_issue', {}, 4),
    ])
    expect(s.events.map((e) => [e.label, e.text])).toEqual([
      ['READ', 'src/a.ts'],
      ['BASH', 'npm test'],
      ['SEARCH', 'TODO in src'], // whitespace is collapsed for display
      ['MCP', 'github · create_issue'],
    ])
    expect(summarize(s).toolCalls).toBe(4)
  })

  it('marks the originating tool event failed when its result is an error', () => {
    const s = run([toolUse('t1', 'Bash', { command: 'npm test' }, 1), toolResult('t1', 2, { isError: true, text: '2 failed: ioredis not installed' })])
    expect(s.events[0]).toMatchObject({ failed: true, note: '2 failed: ioredis not installed' })
    expect(s.events).toHaveLength(1)
  })

  it('adds an ERROR event for a failed result whose call it never saw', () => {
    const s = run([toolResult('unknown', 1, { isError: true, text: 'boom' })])
    expect(s.events[0]).toMatchObject({ kind: 'error', label: 'ERROR', failed: true })
  })

  it('redacts secrets and collapses whitespace in prompts and commands', () => {
    const token = 'ghp_' + 'Ab1'.repeat(12)
    const s = run([prompt(`use   ${token}\nplease`, 1), toolUse('t1', 'Bash', { command: `API_TOKEN=abcdef123456 run.sh` }, 2)])
    expect(JSON.stringify(s.events)).not.toContain(token)
    expect(JSON.stringify(s.events)).not.toContain('abcdef123456')
    expect(s.events[0]?.text).toContain('please')
    expect(s.events[0]?.text).not.toContain('\n')
  })

  it('truncates very long text', () => {
    expect(run([prompt('x'.repeat(5000), 1)]).events[0]?.text.length).toBeLessThanOrEqual(400)
  })
})

describe('files changed', () => {
  it('counts +/- lines per edit result and sums across calls', () => {
    const patch = (lines: string[]) => [{ lines }]
    const s = run([
      toolUse('e1', 'Edit', { file_path: 'src/a.ts' }, 1),
      toolResult('e1', 2, { result: { filePath: 'src/a.ts', structuredPatch: patch([' ctx', '+new1', '+new2', '-old']) } }),
      toolUse('e2', 'Edit', { file_path: 'src/a.ts' }, 3),
      toolResult('e2', 4, { result: { filePath: 'src/a.ts', structuredPatch: patch(['+x']) } }),
      toolUse('w1', 'Write', { file_path: 'src/b.ts' }, 5),
      toolResult('w1', 6, { result: { type: 'create', filePath: 'src/b.ts', content: 'a\nb\nc' } }),
    ])
    expect([...s.files.values()]).toEqual([
      { path: 'src/a.ts', added: 3, removed: 1 },
      { path: 'src/b.ts', added: 3, removed: 0, created: true },
    ])
    expect(summarize(s)).toMatchObject({ linesAdded: 6, linesRemoved: 1 })
  })

  it('lists an edited file even before its result arrives', () => {
    expect(run([toolUse('e1', 'Edit', { file_path: 'src/a.ts' }, 1)]).files.get('src/a.ts')).toEqual({ path: 'src/a.ts', added: 0, removed: 0 })
  })
})

describe('tokens, context and cost', () => {
  const usage = (i: number, o: number, cr: number, cc: number) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cc })

  it('counts usage once per assistant message id even when it spans several lines', () => {
    const s = run([
      toolUse('t1', 'Read', { file_path: 'a' }, 1, 'msgA', usage(10, 100, 1000, 0)),
      toolUse('t2', 'Read', { file_path: 'b' }, 2, 'msgA', usage(10, 100, 1000, 0)), // same message, second block
      toolUse('t3', 'Read', { file_path: 'c' }, 3, 'msgB', usage(5, 50, 2000, 300)),
    ])
    const sum = summarize(s)
    expect(sum.tokens).toEqual({ input: 15, output: 150, cacheRead: 3000, cacheCreation: 300 })
    expect(sum.assistantMessages).toBe(2)
    expect(sum.contextTokens).toBe(5 + 2000 + 300)
  })

  it('ignores synthetic-model messages and lists real models', () => {
    const synthetic = { type: 'assistant', timestamp: T(1), message: { id: 's', model: '<synthetic>', content: [], usage: usage(1, 1, 1, 1) } }
    const s = run([synthetic, toolUse('t1', 'Read', { file_path: 'a' }, 2, 'm', usage(1, 1, 1, 1))])
    expect(summarize(s)).toMatchObject({ model: 'claude-test', models: ['claude-test'], assistantMessages: 1 })
  })

  it('uses the last cost-state for cost and line totals', () => {
    const s = run([
      { type: 'cost-state', totalCostUSD: 0.1, totalLinesAdded: 1, totalLinesRemoved: 0 },
      { type: 'cost-state', totalCostUSD: 0.427, totalLinesAdded: 49, totalLinesRemoved: 2 },
    ])
    expect(summarize(s)).toMatchObject({ costUSD: 0.427, linesAdded: 49, linesRemoved: 2 })
  })

  it('leaves cost undefined when there is no cost-state', () => {
    expect(summarize(run([prompt('x', 1)])).costUSD).toBeUndefined()
  })
})

describe('compaction', () => {
  const boundary = (pre: number, post: number) => ({ type: 'system', subtype: 'compact_boundary', uuid: 'c1', timestamp: T(9), compactMetadata: { trigger: 'auto', preTokens: pre, postTokens: post } })

  it('adds a COMPACTED event and counts it, never storing the summary text', () => {
    const s = run([boundary(393_336, 8_583), prompt('SUMMARY-TEXT-SHOULD-NOT-APPEAR', 10, { isCompactSummary: true })])
    expect(s.events).toHaveLength(1)
    expect(s.events[0]).toMatchObject({ kind: 'system', label: 'COMPACTED', text: 'Context compacted 393k → 9k tokens', note: 'Trigger: auto' })
    expect(JSON.stringify(s.events)).not.toContain('SUMMARY-TEXT')
    expect(summarize(s)).toMatchObject({ compactions: 1, prompts: 0 })
  })

  it('infers a 1M window when observed tokens exceed 200k, otherwise 200k', () => {
    const withUsage = (cr: number) => toolUse('t', 'Read', { file_path: 'a' }, 1, 'm', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: cr, cache_creation_input_tokens: 0 })
    expect(summarize(run([withUsage(50_000)])).contextWindow).toBe(200_000)
    expect(summarize(run([boundary(393_336, 8_583), withUsage(50_000)])).contextWindow).toBe(1_000_000)
  })
})

describe('robustness', () => {
  it('ignores junk, unknown types and malformed shapes without throwing', () => {
    const junk: unknown[] = [null, 5, 'str', [], {}, { type: 5 }, { type: 'future-type', x: 1 }, { type: 'user', message: 7 }, { type: 'assistant', message: { content: 'nope', usage: 'x' } }, { type: 'user', message: { content: [null, 3, { type: 'tool_result' }] } }]
    expect(() => run(junk)).not.toThrow()
    expect(summarize(run(junk)).prompts).toBe(0)
  })

  it('still summarises correctly without keeping events', () => {
    const lines = [prompt('hello', 1), toolUse('t1', 'Edit', { file_path: 'a' }, 2, 'm', { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 })]
    const s = run(lines, false)
    expect(s.events).toEqual([])
    expect(summarize(s)).toMatchObject({ prompts: 1, toolCalls: 1, tokens: { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 } })
  })

  it('caps stored events and says so', () => {
    const s = createSessionState('x', { keepEvents: true })
    for (let i = 0; i < MAX_EVENTS + 5; i++) applyLine(s, prompt(`p${i}`, 1))
    expect(s.events).toHaveLength(MAX_EVENTS)
    expect(s.eventsTruncated).toBe(true)
    expect(summarize(s).prompts).toBe(MAX_EVENTS + 5)
  })
})

describe('resumed sessions', () => {
  const usage = (o: number) => ({ input_tokens: 1, output_tokens: o, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })

  it('counts only usage from the current run once cost-state reveals its start', () => {
    const runStart = Date.parse('2026-01-01T10:00:30.000Z')
    const s = run([
      toolUse('t1', 'Read', { file_path: 'a' }, 1, 'old1', usage(1000)), // replayed history (10:00:01)
      toolUse('t2', 'Read', { file_path: 'b' }, 2, 'old2', usage(2000)), // replayed history
      toolUse('t3', 'Read', { file_path: 'c' }, 40, 'new1', usage(5)), // this run (10:00:40)
      { type: 'cost-state', totalCostUSD: 1.5, startTime: runStart },
    ])
    expect(summarize(s)).toMatchObject({ tokens: { output: 5, input: 1 }, assistantMessages: 1, costUSD: 1.5 })
  })

  it('counts everything when there is no cost-state yet (live session)', () => {
    const s = run([toolUse('t1', 'Read', { file_path: 'a' }, 1, 'm1', usage(10)), toolUse('t2', 'Read', { file_path: 'b' }, 2, 'm2', usage(20))])
    expect(summarize(s).tokens.output).toBe(30)
  })
})

describe('task lists', () => {
  const todo = (todos: object[], n: number) => toolUse(`td${n}`, 'TodoWrite', { todos }, n)

  it('TodoWrite replaces the whole list and counts by status', () => {
    const s = run([
      todo([{ content: 'Read middleware', status: 'completed' }, { content: 'Add limiter', status: 'in_progress' }, { content: 'Add tests', status: 'pending' }], 1),
      todo([{ content: 'Read middleware', status: 'completed' }, { content: 'Add limiter', status: 'completed' }, { content: 'Add tests', status: 'in_progress' }, { content: 'Docs', status: 'pending' }], 2),
    ])
    expect(s.tasks.map((t) => [t.text, t.status])).toEqual([
      ['Read middleware', 'completed'],
      ['Add limiter', 'completed'],
      ['Add tests', 'in_progress'],
      ['Docs', 'pending'],
    ])
    expect(summarize(s).tasks).toEqual({ open: 2, inProgress: 1, done: 2 })
  })

  it('tolerates junk todos and unknown statuses, and redacts text', () => {
    const s = run([todo([null, 5, { status: 'pending' }, { content: 'Use API_TOKEN=abcdef123456', status: 'weird' }, { content: 'Gone', status: 'deleted' }], 1)])
    expect(s.tasks).toHaveLength(1)
    expect(s.tasks[0]?.status).toBe('pending')
    expect(s.tasks[0]?.text).not.toContain('abcdef123456')
    expect(() => run([toolUse('x', 'TodoWrite', { todos: 'nope' }, 1)])).not.toThrow()
  })

  it('TaskCreate/TaskUpdate edit items by id, taking the id from the create result when present', () => {
    const s = run([
      toolUse('c1', 'TaskCreate', { subject: 'Write migration' }, 1),
      toolResult('c1', 2, { result: { task: { id: '7' } } }),
      toolUse('c2', 'TaskCreate', { subject: 'Add tests' }, 3),
      toolUse('u1', 'TaskUpdate', { taskId: '7', status: 'completed' }, 4),
      toolUse('u2', 'TaskUpdate', { taskId: 'missing', status: 'completed' }, 5),
    ])
    expect(s.tasks.map((t) => [t.id, t.text, t.status])).toEqual([
      ['7', 'Write migration', 'completed'],
      [expect.any(String), 'Add tests', 'pending'],
    ])
  })

  it('deleting via TaskUpdate removes the item', () => {
    const s = run([toolUse('c1', 'TaskCreate', { subject: 'x', taskId: 'a' }, 1), toolUse('u1', 'TaskUpdate', { taskId: 'a', status: 'deleted' }, 2)])
    expect(s.tasks).toEqual([])
  })
})

describe('failure tracking', () => {
  const fail = (id: string, n: number) => toolResult(id, n, { isError: true, text: 'boom' })

  it('groups failures by tool and command prefix, without keeping events', () => {
    const s = run(
      [
        toolUse('a', 'Bash', { command: 'npm test -- orders' }, 1),
        fail('a', 2),
        toolUse('b', 'Bash', { command: 'CI=1 npm test --silent' }, 3), // leading env assignment is ignored
        fail('b', 4),
        toolUse('c', 'Bash', { command: 'ls' }, 5),
        toolResult('c', 6), // succeeded: not counted
        toolUse('d', 'mcp__linear__get_issue', {}, 7),
        fail('d', 8),
        toolUse('e', 'Read', { file_path: 'x' }, 9),
        fail('e', 10),
      ],
      false,
    )
    expect(summarize(s).failures).toEqual([
      { key: 'BASH npm test', count: 2 },
      { key: 'MCP linear', count: 1 },
      { key: 'READ', count: 1 },
    ])
  })

  it('never puts secrets into failure keys, and ignores results with unknown tool ids', () => {
    const s = run([toolUse('a', 'Bash', { command: 'API_TOKEN=abcdef123456 deploy --prod' }, 1), fail('a', 2), fail('ghost', 3)], false)
    expect(JSON.stringify(summarize(s).failures)).not.toContain('abcdef123456')
    expect(summarize(s).failures).toEqual([{ key: 'BASH deploy --prod', count: 1 }])
  })
})

describe('failure keys for compound commands', () => {
  it('uses the command that did the work, not a leading cd or export', () => {
    const s = run(
      [
        toolUse('a', 'Bash', { command: 'cd "D:/My Docs/project" && npm test -- x' }, 1),
        toolResult('a', 2, { isError: true, text: 'boom' }),
        toolUse('b', 'Bash', { command: 'export A=1; pnpm build' }, 3),
        toolResult('b', 4, { isError: true, text: 'boom' }),
      ],
      false,
    )
    expect(summarize(s).failures.map((f) => f.key).sort()).toEqual(['BASH npm test', 'BASH pnpm build'])
  })
})
