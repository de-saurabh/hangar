import { useQuery } from '@tanstack/react-query'
import { LARGE_MEMORY_TOKENS, type MemoryFile } from '@hangar/shared'
import { api } from '../api'
import { timeAgo } from '../time'

// A bar at this many tokens is "full"; purely visual scale.
const BAR_MAX_TOKENS = 6000

function whenLine(f: MemoryFile): string {
  const parts: string[] = []
  if (f.kind === 'nested') parts.push(`Loaded when working in ${f.scopeDir}`)
  else if (f.modifiedAt) parts.push(`Edited ${timeAgo(f.modifiedAt)}`)
  if (f.lines !== undefined) parts.push(`${f.lines} lines`)
  return parts.join(' · ')
}

export function ClaudeMdPanel({ repoId }: { repoId: string }) {
  const { data, isPending, error } = useQuery({ queryKey: ['memory', repoId], queryFn: () => api.memory(repoId) })
  const files = data?.filter((f) => f.exists) ?? []

  return (
    <aside className="flex min-w-0 flex-[1_1_360px] flex-col gap-3 rounded-[14px] border border-border bg-surface p-[18px]">
      <h2 className="text-[17px] font-bold">CLAUDE.md files</h2>
      <span className="text-[13px] text-muted">Instructions Claude Code loads for this repo, in this order. Token counts are estimates.</span>

      {isPending && <p className="text-sm text-muted">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-error">
          Couldn't load CLAUDE.md files: {error.message}
        </p>
      )}
      {data && files.length === 0 && <p className="text-sm text-muted">No CLAUDE.md files found for this repo.</p>}

      {files.map((f) => {
        const large = (f.tokens ?? 0) > LARGE_MEMORY_TOKENS
        return (
          <div key={f.path} className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
            <span className="flex justify-between gap-2">
              <span className="break-all font-mono text-[13px]">{f.label}</span>
              {f.tokens !== undefined && <span className="whitespace-nowrap text-xs text-muted">~{f.tokens.toLocaleString()} tokens</span>}
            </span>
            {f.tokens !== undefined && (
              <span className="h-[5px] overflow-hidden rounded-[3px] bg-border">
                <span
                  className={`block h-full ${large ? 'bg-waiting' : 'bg-accent'}`}
                  style={{ width: `${Math.min(100, Math.round((f.tokens / BAR_MAX_TOKENS) * 100))}%` }}
                />
              </span>
            )}
            {f.error && (
              <span role="alert" className="text-xs text-waiting">
                {f.error}
              </span>
            )}
            {large && <span className="text-xs text-waiting">Large: loaded into context every session.</span>}
            <span className="text-xs text-muted">{whenLine(f)}</span>
          </div>
        )
      })}
    </aside>
  )
}
