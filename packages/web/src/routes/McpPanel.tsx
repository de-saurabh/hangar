import { useQuery } from '@tanstack/react-query'
import type { McpServer, SettingScope } from '@hangar/shared'
import { api } from '../api'
import { SCOPE_CHIP, SCOPE_LABEL } from '../scopes'

function detail(s: McpServer): string {
  const parts: string[] = [s.transport]
  if (s.command) parts.push(`${s.command}${s.argCount ? ` (+${s.argCount} args)` : ''}`)
  if (s.url) parts.push(s.url)
  if (s.envKeys.length > 0) parts.push(`env: ${s.envKeys.join(', ')}`)
  return parts.join(' · ')
}

export function McpPanel({ repoId, tab }: { repoId: string; tab: 'effective' | SettingScope }) {
  const { data, isPending, error } = useQuery({ queryKey: ['mcp', repoId], queryFn: () => api.mcp(repoId) })
  const servers = data?.servers.filter((s) => tab === 'effective' || s.scope === tab) ?? []
  // user and local scopes share ~/.claude.json: report each broken file once.
  const broken = (data?.sources ?? []).filter((s, i, all) => s.error && all.findIndex((o) => o.path === s.path) === i)

  return (
    <section className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-[18px]">
      <h2 className="text-[17px] font-bold">MCP servers</h2>
      {isPending && <p className="text-sm text-muted">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-error">
          Couldn't load MCP servers: {error.message}
        </p>
      )}
      {broken.map((s) => (
        <p key={s.path} role="alert" className="text-sm text-waiting">
          Couldn't read {s.path.split(/[\\/]/).pop()} ({s.error}).
        </p>
      ))}
      {data && servers.length === 0 && <p className="text-sm text-muted">{tab === 'effective' ? 'No MCP servers configured.' : 'No MCP servers at this level.'}</p>}
      {servers.map((s) => (
        <div key={`${s.scope}|${s.name}`} className={`flex flex-col gap-0.5 ${s.overriddenBy ? 'opacity-60' : ''}`}>
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{s.name}</span>
            <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-bold text-bg ${SCOPE_CHIP[s.scope]}`}>{SCOPE_LABEL[s.scope]}</span>
          </span>
          <span className="break-all font-mono text-xs text-muted">{detail(s)}</span>
          {s.overriddenBy && <span className="text-xs text-muted">Overridden by the {SCOPE_LABEL[s.overriddenBy]} server of the same name</span>}
          {s.approval && s.approval !== 'approved' && (
            <span className="text-xs text-waiting">{s.approval === 'rejected' ? 'Rejected in Claude Code' : 'Not yet approved in Claude Code'}</span>
          )}
        </div>
      ))}
      <span className="text-xs text-muted">Not health-checked. Health checks come later and run only when you ask.</span>
    </section>
  )
}
