import { useQuery } from '@tanstack/react-query'
import { Section } from '../../components/Section'
import { api } from '../../api'

/** Read-only: says where a credential sits, never shows it. */
export function SecretsSection({ repoId }: { repoId: string }) {
  const { data } = useQuery({ queryKey: ['secrets', repoId], queryFn: () => api.secrets(repoId) })
  if (!data) return null
  return (
    <Section title="Secrets check">
      <p className="m-0 mb-2 text-[13px] text-muted">Looks for credentials in the settings and CLAUDE.md files Claude Code reads. Values are never shown. Heuristic: it can miss unusual formats.</p>
      {data.findings.length === 0 && (
        <p className="m-0 text-[13.5px] text-running">
          No credentials found in {data.filesChecked} file{data.filesChecked === 1 ? '' : 's'}.
        </p>
      )}
      {data.findings.map((f, i) => (
        <div key={i} className="flex flex-col gap-0.5 border-t border-border py-2 text-[13px] first:border-t-0">
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
    </Section>
  )
}
