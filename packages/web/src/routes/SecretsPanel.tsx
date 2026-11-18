import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

/** Read-only: says where a credential sits, never shows it. */
export function SecretsPanel({ repoId }: { repoId: string }) {
  const { data, isError } = useQuery({ queryKey: ['secrets', repoId], queryFn: () => api.secrets(repoId) })
  if (isError) return null
  if (!data) return null
  return (
    <section aria-label="Secrets check" className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-border bg-surface p-[18px]">
      <h2 className="text-[17px] font-bold">Secrets check</h2>
      <span className="text-[13px] text-muted">Looks for credentials in the settings and CLAUDE.md files Claude Code reads. Values are never shown. Heuristic: it can miss unusual formats.</span>
      {data.findings.length === 0 && <p className="m-0 text-sm text-running">No credentials found in {data.filesChecked} file{data.filesChecked === 1 ? '' : 's'}.</p>}
      {data.findings.map((f, i) => (
        <div key={i} className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[13px]">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <b className="text-waiting">{f.kind}</b>
            <span className="break-all font-mono text-xs text-muted">
              {f.file}:{f.line}
            </span>
          </span>
          <span className="text-xs text-muted">
            {f.shared ? 'This file is meant to be committed. Move the value to an environment variable and rotate it if it was ever pushed.' : 'Local file, but move it to an environment variable if you can.'}
          </span>
        </div>
      ))}
    </section>
  )
}
