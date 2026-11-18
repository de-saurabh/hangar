import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

/**
 * The one place Hangar writes to ~/.claude. Shows the exact diff first; the
 * write only happens on the confirm button, and a backup is made.
 */
export function HooksSetup() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const { data: preview } = useQuery({ queryKey: ['hooks-preview'], queryFn: api.hooksPreview })

  if (!preview) return null

  return (
    <>
      {preview.installed ? (
        <p className="m-0 text-xs text-muted">
          Live hooks are on.{' '}
          <button type="button" onClick={() => setOpen(true)} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline">
            Review or remove
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-waiting/50 bg-[#2a2210] px-4 py-3">
          <p className="m-0 max-w-2xl text-sm text-[#fde68a]">
            Hangar can only see busy/idle right now. Enable hooks to know the moment a session is <b>waiting for you</b> and what it wants to run.
          </p>
          <button type="button" onClick={() => setOpen(true)} className="min-h-10 cursor-pointer rounded-lg border-0 bg-accent px-3.5 text-sm font-bold text-bg">
            Review &amp; enable
          </button>
        </div>
      )}
      {open && (
        <ConfirmDialog
          onClose={() => {
            setOpen(false)
            void qc.invalidateQueries({ queryKey: ['hooks-preview'] })
          }}
        />
      )}
    </>
  )
}

function ConfirmDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { data: p, isPending, error } = useQuery({ queryKey: ['hooks-preview-fresh'], queryFn: api.hooksPreview, gcTime: 0 })
  const [done, setDone] = useState<string>()
  const apply = useMutation({
    mutationFn: () => api.hooksApply(p!.action, p!.token),
    onSuccess: (r) => setDone(r.backupPath ? `Done. Backup saved to ${r.backupPath}` : 'Done.'),
  })

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const verb = p?.action === 'uninstall' ? 'Remove' : 'Enable'

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(860px,92vw)] rounded-[14px] border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-bold">{verb} live status hooks</h2>
        {isPending && <p className="m-0 text-sm text-muted">Reading settings…</p>}
        {error && <p role="alert" className="m-0 text-sm text-error">{error.message}</p>}
        {p && (
          <>
            <p className="m-0 text-sm text-muted">
              This edits <code className="font-mono text-text">{p.settingsPath}</code> (only the <code className="font-mono">hooks</code> section; comments and your other
              hooks stay). Each hook POSTs a small event to <code className="font-mono">127.0.0.1</code> on this machine, and it never blocks Claude if Hangar is closed. A backup is saved first.
            </p>
            {p.diff ? <DiffView diff={p.diff} /> : <p className="m-0 text-sm text-muted">Nothing to change.</p>}
            {apply.error && <p role="alert" className="m-0 text-sm text-error">{apply.error.message}</p>}
            {done && <p className="m-0 break-all text-sm text-running">{done}</p>}
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className="min-h-10 cursor-pointer rounded-lg border border-border bg-transparent px-3.5 text-sm font-semibold text-text">
            {done ? 'Close' : 'Cancel'}
          </button>
          {p && !done && p.diff && (
            <button
              type="button"
              disabled={apply.isPending}
              onClick={() => apply.mutate()}
              className="min-h-10 cursor-pointer rounded-lg border-0 bg-accent px-3.5 text-sm font-bold text-bg disabled:opacity-50"
            >
              {apply.isPending ? 'Writing…' : `${verb} hooks`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}

export function DiffView({ diff }: { diff: string }) {
  // Drop the file header lines; colour added/removed lines.
  const lines = diff.split('\n').filter((l) => !l.startsWith('===') && !l.startsWith('---') && !l.startsWith('+++'))
  return (
    <pre className="m-0 max-h-[50vh] overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className={l.startsWith('+') ? 'text-running' : l.startsWith('-') ? 'text-error' : l.startsWith('@@') ? 'text-done' : 'text-muted'}>
          {l || ' '}
        </div>
      ))}
    </pre>
  )
}
