import { describe, expect, it } from 'vitest'
import { buildMcpServers } from '../src/index'

describe('buildMcpServers', () => {
  it('summarises stdio and http servers across scopes', () => {
    const servers = buildMcpServers({
      user: { github: { type: 'stdio', command: 'npx', args: ['-y', 'pkg'], env: { B_KEY: 'x', A_KEY: 'y' } } },
      project: { postgres: { command: 'node', args: [] } },
      local: { linear: { type: 'http', url: 'https://mcp.example.com/sse' } },
    })
    expect(servers).toEqual([
      { name: 'linear', scope: 'local', transport: 'http', url: 'https://mcp.example.com/sse', envKeys: [] },
      { name: 'postgres', scope: 'project', transport: 'stdio', command: 'node', argCount: 0, envKeys: [], approval: 'unknown' },
      { name: 'github', scope: 'user', transport: 'stdio', command: 'npx', argCount: 2, envKeys: ['A_KEY', 'B_KEY'] },
    ])
  })

  it('never exposes args, env values, headers or URL secrets', () => {
    const servers = buildMcpServers({
      user: {
        a: { command: 'run', args: ['--token', 'ARG-SECRET'], env: { TOKEN: 'ENV-SECRET' } },
        b: { type: 'http', url: 'https://u:URL-PW@host.example/mcp?key=QUERY-SECRET', headers: { Authorization: 'Bearer HDR-SECRET' } },
      },
    })
    const json = JSON.stringify(servers)
    for (const secret of ['ARG-SECRET', 'ENV-SECRET', 'URL-PW', 'QUERY-SECRET', 'HDR-SECRET']) {
      expect(json).not.toContain(secret)
    }
    expect(servers.find((s) => s.name === 'a')?.envKeys).toEqual(['TOKEN'])
    expect(servers.find((s) => s.name === 'b')?.url).toBe('https://host.example/mcp')
  })

  it('marks lower-precedence duplicates as overridden (local > project > user)', () => {
    const servers = buildMcpServers({
      user: { db: { command: 'a' } },
      project: { db: { command: 'b' } },
      local: { db: { command: 'c' } },
    })
    expect(servers.map((s) => [s.scope, s.overriddenBy])).toEqual([
      ['local', undefined],
      ['project', 'local'],
      ['user', 'local'],
    ])
  })

  it('tracks approval of .mcp.json servers', () => {
    const servers = buildMcpServers({
      project: { ok: { command: 'a' }, no: { command: 'b' }, new: { command: 'c' } },
      enabled: ['ok'],
      disabled: ['no', 42],
    })
    expect(Object.fromEntries(servers.map((s) => [s.name, s.approval]))).toEqual({ ok: 'approved', no: 'rejected', new: 'unknown' })
  })

  it('tolerates junk and unknown transports', () => {
    expect(buildMcpServers({})).toEqual([])
    expect(buildMcpServers({ user: 'nope', local: [], project: null })).toEqual([])
    expect(buildMcpServers({ user: { weird: 5, odd: { type: 'future-transport' } } }).map((s) => s.transport)).toEqual(['unknown', 'future-transport'])
  })
})
