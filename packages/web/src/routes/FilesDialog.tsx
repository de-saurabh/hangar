import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { FilesPreviewView } from '@hangar/shared'
import { DiffView } from './HooksSetup'

const STATUS: Record<string, string> = { new: 'New file', changed: 'Overwrites', same: 'No change' }

/**
 * Diff-then-confirm for any multi-file write. Nothing is written until the
 * confirm button; the preview token ties the write to exactly what was shown.
 */
export function FilesDialog({
  title,
  intro,
  load,
  apply,
  confirmLabel,
  onClose,
}: {
  title: string
  intro: string
  load: () => Promise<FilesPreviewView>
  apply: (token: string) => Promise<{ written: number; backupPaths: string[] }>
  confirmLabel: string
  onClose: (changed: boolean) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [done, setDone] = useState<{ written: number; backups: number }>()
  const { data: p, error } = useQuery({ queryKey: ['files-preview', title], queryFn: load, gcTime: 0, retry: false })
  const run = useMutation({
    mutationFn: () => apply(p!.token),
    onSuccess: (r) => setDone({ written: r.written, backups: r.backupPaths.length }),
  })
  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const pending = p?.files.filter((f) => f.status !== 'same') ?? []
  return (
    <dialog ref={ref} onClose={() => onClose(done !== undefined)} className="m-auto w-[min(820px,94vw)] rounded-[14px] border border-border bg-surface p-0 text-text backdrop:bg-black/60">
      <div className="flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-bold">{title}</h2>
        <p className="m-0 text-sm text-muted">{intro}</p>
        {!p && !error && <p className="m-0 text-sm text-muted">Preparing diff…</p>}
        {error && <p role="alert" className="m-0 text-sm text-error">{error.message}</p>}
        {p && p.files.length > 0 && pending.length === 0 && <p className="m-0 text-sm text-muted">Nothing to change: everything is already in place.</p>}
        {p?.files.map((f) => (
          <div key={f.path} className="flex flex-col gap-1.5">
            <span className="flex flex-wrap justify-between gap-2 text-xs">
              <code className="break-all font-mono text-text">{f.path}</code>
              <span className={f.status === 'changed' ? 'font-bold text-waiting' : 'text-muted'}>{STATUS[f.status]}</span>
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
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className="min-h-9 cursor-pointer rounded-lg border border-border bg-transparent px-3.5 text-sm font-semibold text-text">
            {done ? 'Close' : 'Cancel'}
          </button>
          {p && !done && pending.length > 0 && (
            <button type="button" disabled={run.isPending} onClick={() => run.mutate()} className="min-h-9 cursor-pointer rounded-lg border-0 bg-accent px-3.5 text-sm font-bold text-bg disabled:opacity-50">
              {run.isPending ? 'Writing…' : confirmLabel}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
