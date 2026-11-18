import { useMutation, useQuery } from '@tanstack/react-query'
import type { McpServer } from '@hangar/shared'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { EmptyLine, Section } from '../../components/Section'
import { SCOPE_LABEL, ScopeTag } from '../../components/ScopeTag'
import type { View } from './Config'

function detail(s: McpServer): string {
  const parts: string[] = [s.transport]
  if (s.command) parts.push(`${s.command}${s.argCount ? ` (+${s.argCount} args)` : ''}`)
  if (s.url) parts.push(s.url)
  if (s.envKeys.length > 0) parts.push(`env: ${s.envKeys.join(', ')}`)
  return parts.join(' · ')
}

export function McpSection({ repoId, view }: { repoId: string; view: View }) {
  const { data, isPending, error } = useQuery({ queryKey: ['mcp', repoId], queryFn: () => api.mcp(repoId) })
  const servers = data?.servers.filter((s) => view === 'effective' || s.scope === view) ?? []
  // user and local scopes share ~/.claude.json: report each broken file once.
  const broken = (data?.sources ?? []).filter((s, i, all) => s.error && all.findIndex((o) => o.path === s.path) === i)

  return (
    <Section title="MCP servers" count={servers.length}>
      {isPending && <EmptyLine>Loading…</EmptyLine>}
      {error && <p role="alert" className="m-0 text-sm text-error">Couldn't load MCP servers: {error.message}</p>}
      {broken.map((s) => (
        <p key={s.path} role="alert" className="m-0 text-sm text-waiting">
          Couldn't read {s.path.split(/[\\/]/).pop()} ({s.error}).
        </p>
      ))}
      {data && servers.length === 0 && <EmptyLine>{view === 'effective' ? 'No MCP servers configured.' : 'No MCP servers at this level.'}</EmptyLine>}
      {servers.map((s) => (
        <div key={`${s.scope}|${s.name}`} className={`flex flex-col gap-0.5 border-t border-border py-2 first:border-t-0 ${s.overriddenBy ? 'opacity-60' : ''}`}>
          <span className="flex items-center justify-between gap-2">
            <span className="text-[13.5px] font-semibold">{s.name}</span>
            <ScopeTag scope={s.scope} />
          </span>
          <span className="break-all font-mono text-xs text-muted">{detail(s)}</span>
          {s.overriddenBy && <span className="text-xs text-muted">Overridden by the {SCOPE_LABEL[s.overriddenBy]} server of the same name</span>}
          <HealthCheck repoId={repoId} server={s} />
          {s.approval && s.approval !== 'approved' && <span className="text-xs text-waiting">{s.approval === 'rejected' ? 'Rejected in Claude Code' : 'Not yet approved in Claude Code'}</span>}
        </div>
      ))}
      <p className="m-0 mt-2 text-xs text-muted">Health checks run only when you click Check. HTTP servers get one request with no credentials; stdio servers are looked up on PATH, never started.</p>
    </Section>
  )
}

function HealthCheck({ repoId, server }: { repoId: string; server: McpServer }) {
  const check = useMutation({ mutationFn: () => api.checkMcp(repoId, server.name, server.scope) })
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <Button variant="quiet" className="min-h-0 border-0 p-0 text-xs" disabled={check.isPending} onClick={() => check.mutate()}>
        {check.isPending ? 'Checking…' : check.data ? 'Check again' : 'Check'}
      </Button>
      {check.data && <span className={check.data.ok ? 'text-running' : 'text-error'}>{check.data.summary}</span>}
      {check.error && <span role="alert" className="text-error">{check.error.message}</span>}
    </span>
  )
}
