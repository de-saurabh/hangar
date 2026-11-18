import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { FilesPreviewView } from '@hangar/shared'
import { Button } from '../../components/Button'
import { DiffView } from '../../components/DiffView'
import { ModalDialog } from '../../components/ModalDialog'

const STATUS: Record<string, string> = { new: 'New file', changed: 'Overwrites', same: 'No change' }

interface Props {
  title: string
  intro: string
  load: () => Promise<FilesPreviewView>
  apply: (token: string) => Promise<{ written: number; backupPaths: string[] }>
  confirmLabel: string
  /** `changed` is true if something was written. */
  onClose: (changed: boolean) => void
}

/**
 * Diff-then-confirm for any multi-file write. Nothing is written until the
 * confirm button; the preview token ties the write to exactly what was shown.
 */
export function FilesDialog({ title, intro, load, apply, confirmLabel, onClose }: Props) {
  const [done, setDone] = useState<{ written: number; backups: number }>()
  const { data: p, error } = useQuery({ queryKey: ['files-preview', title], queryFn: load, gcTime: 0, retry: false })
  const run = useMutation({
    mutationFn: () => apply(p!.token),
    onSuccess: (r) => setDone({ written: r.written, backups: r.backupPaths.length }),
  })
  const pending = p?.files.filter((f) => f.status !== 'same') ?? []

  return (
    <ModalDialog
      title={title}
      onClose={() => onClose(done !== undefined)}
      actions={(close) => (
        <>
          <Button autoFocus onClick={close}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {p && !done && pending.length > 0 && (
            <Button variant="primary" disabled={run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? 'Writing…' : confirmLabel}
            </Button>
          )}
        </>
      )}
    >
      <p className="m-0 text-sm text-muted">{intro}</p>
      {!p && !error && <p className="m-0 text-sm text-muted">Preparing diff…</p>}
      {error && <p role="alert" className="m-0 text-sm text-error">{error.message}</p>}
      {p && p.files.length > 0 && pending.length === 0 && <p className="m-0 text-sm text-muted">Nothing to change: everything is already in place.</p>}
      {p?.files.map((f) => (
        <div key={f.path} className="flex flex-col gap-1.5">
          <span className="flex flex-wrap justify-between gap-2 text-xs">
            <code className="break-all font-mono text-text">{f.path}</code>
            <span className={f.status === 'changed' ? 'font-semibold text-waiting' : 'text-muted'}>{STATUS[f.status]}</span>
          </span>
          {f.diff && <DiffView diff={f.diff} />}
        </div>
      ))}
      {run.error && <p role="alert" className="m-0 text-sm text-error">{run.error.message}</p>}
      {done && (
        <p className="m-0 text-sm text-running">
          Done: {done.written} file{done.written === 1 ? '' : 's'} written{done.backups ? `, ${done.backups} backed up in ~/.hangar/backups` : ''}.
        </p>
      )}
    </ModalDialog>
  )
}
