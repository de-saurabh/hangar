import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { Section } from '../../components/Section'
import { timeAgo } from '../../time'

/** A local git history of your Claude config. For looking back, not for restoring: settings are saved with secrets masked. */
export function Backup() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['backup'], queryFn: api.backup })
  const [showHistory, setShowHistory] = useState(false)
  const run = useMutation({
    mutationFn: api.runBackup,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['backup'] }),
  })

  return (
    <Section title="Backup">
      <p className="m-0 mb-2.5 text-[13px] leading-normal text-muted">
        Your CLAUDE.md, settings, commands, agents and skills, versioned in a git repo on this machine (<code className="font-mono">~/.hangar/claude-backup</code>). Sessions, history and credentials are excluded, and settings.json is
        saved with secrets masked, so it's for history rather than restoring.
      </p>
      {data?.exists && data.lastAt ? (
        <p className="m-0 mb-2 text-[13px]">
          <b className="font-semibold text-running">Backed up</b> {timeAgo(data.lastAt)} · {data.versions} version{data.versions === 1 ? '' : 's'}
        </p>
      ) : (
        <p className="m-0 mb-2 text-[13px] text-muted">No backup yet.</p>
      )}
      {run.isSuccess && <p className="m-0 mb-2 text-[13px] text-muted">{run.data.changed ? 'Saved a new version.' : 'No changes since the last backup.'}</p>}
      {run.error && <p role="alert" className="m-0 mb-2 text-[13px] text-error">{run.error.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={run.isPending} onClick={() => run.mutate()}>
          {run.isPending ? 'Backing up…' : 'Back up now'}
        </Button>
        {data && data.history.length > 0 && (
          <Button variant="quiet" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? 'Hide history' : 'View history'}
          </Button>
        )}
      </div>
      {showHistory && (
        <ul className="m-0 mt-2.5 flex list-none flex-col gap-1 p-0 text-xs text-muted">
          {data?.history.map((h) => (
            <li key={h.commit}>
              <code className="font-mono">{h.commit}</code> {timeAgo(h.date)}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
