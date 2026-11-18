import { useQuery } from '@tanstack/react-query'
import { LARGE_MEMORY_TOKENS, type LintFinding, type MemoryFile } from '@hangar/shared'
import { api } from '../../api'
import { EmptyLine, Section } from '../../components/Section'
import { timeAgo } from '../../time'

/** A bar at this many tokens is "full"; purely visual scale. */
const BAR_MAX_TOKENS = 6000

const RULE_LABEL: Record<LintFinding['rule'], string> = {
  'stale-path': 'Stale path',
  'broken-import': 'Broken import',
  duplicate: 'Duplicate',
  conflict: 'Possible conflict',
  size: 'Large file',
  'section-size': 'Long section',
}

function whenLine(f: MemoryFile): string {
  const parts: string[] = []
  if (f.kind === 'nested') parts.push(`Loaded when working in ${f.scopeDir}`)
  else if (f.modifiedAt) parts.push(`Edited ${timeAgo(f.modifiedAt)}`)
  if (f.lines !== undefined) parts.push(`${f.lines} lines`)
  return parts.join(' · ')
}

/** The CLAUDE.md files Claude loads for this repo, in order, with a check for problems in them. */
export function InstructionsSection({ repoId }: { repoId: string }) {
  const { data, isPending, error } = useQuery({ queryKey: ['memory', repoId], queryFn: () => api.memory(repoId) })
  const files = data?.filter((f) => f.exists) ?? []
  return (
    <Section title="Instructions" count={files.length}>
      <p className="m-0 mb-2 text-[13px] text-muted">CLAUDE.md files Claude Code loads for this repo, in this order. Token counts are estimates.</p>
      {isPending && <EmptyLine>Loading…</EmptyLine>}
      {error && <p role="alert" className="m-0 text-sm text-error">Couldn't load CLAUDE.md files: {error.message}</p>}
      {data && files.length === 0 && <EmptyLine>No CLAUDE.md files found for this repo.</EmptyLine>}
      {files.map((f) => {
        const large = (f.tokens ?? 0) > LARGE_MEMORY_TOKENS
        return (
          <div key={f.path} className="flex flex-col gap-1 border-t border-border py-2.5 first:border-t-0">
            <span className="flex justify-between gap-2">
              <span className="break-all font-mono text-[13px]">{f.label}</span>
              {f.tokens !== undefined && <span className="whitespace-nowrap text-xs text-muted">~{f.tokens.toLocaleString()} tokens</span>}
            </span>
            {f.tokens !== undefined && (
              <span className="h-1 overflow-hidden rounded-sm bg-subtle">
                <span className={`block h-full ${large ? 'bg-waiting' : 'bg-accent'}`} style={{ width: `${Math.min(100, Math.round((f.tokens / BAR_MAX_TOKENS) * 100))}%` }} />
              </span>
            )}
            {f.error && <span role="alert" className="text-xs text-waiting">{f.error}</span>}
            {large && <span className="text-xs text-waiting">Large: loaded into context every session.</span>}
            <span className="text-xs text-muted">{whenLine(f)}</span>
          </div>
        )
      })}
      <Findings repoId={repoId} />
    </Section>
  )
}

function Findings({ repoId }: { repoId: string }) {
  const { data, isError } = useQuery({ queryKey: ['lint', repoId], queryFn: () => api.lint(repoId) })
  if (isError) return <EmptyLine>Couldn't check CLAUDE.md files.</EmptyLine>
  if (!data || data.filesChecked === 0) return null
  return (
    <div aria-label="CLAUDE.md check" role="group" className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
      <h3 className="m-0 text-[13px] font-semibold text-muted">Check</h3>
      {data.findings.length === 0 && <p className="m-0 text-[13.5px] text-running">No problems found.</p>}
      {data.findings.map((f, i) => (
        <div key={i} className="flex flex-col gap-0.5 text-[13px]">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <b className={f.severity === 'warning' ? 'text-waiting' : 'text-muted'}>{RULE_LABEL[f.rule]}</b>
            <span className="break-all font-mono text-xs text-muted">
              {f.file}
              {f.line ? `:${f.line}` : ''}
            </span>
          </span>
          <span>{f.message}</span>
          {f.suggestion && <span className="text-xs text-muted">{f.suggestion}</span>}
        </div>
      ))}
    </div>
  )
}
