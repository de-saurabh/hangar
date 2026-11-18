import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { Button } from '../components/Button'
import { DiffView } from '../components/DiffView'
import { ModalDialog } from '../components/ModalDialog'

/**
 * The one place Hangar writes to ~/.claude for live status. Shows the exact
 * diff first; the write only happens on the confirm button, and a backup is made.
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
          <Button variant="quiet" className="min-h-0 border-0 p-0 text-xs" onClick={() => setOpen(true)}>
            Review or remove
          </Button>
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-[10px] border border-warn-border bg-warn-bg px-3 py-2.5">
          <p className="m-0 text-[13px] text-warn-text">
            Hangar can only see busy and idle right now. Turn on hooks to know the moment a session is <b>waiting for you</b> and what it wants to run.
          </p>
          <Button variant="primary" className="self-start" onClick={() => setOpen(true)}>
            Review and enable
          </Button>
        </div>
      )}
      {open && (
        <HooksDialog
          onClose={() => {
            setOpen(false)
            void qc.invalidateQueries({ queryKey: ['hooks-preview'] })
          }}
        />
      )}
    </>
  )
}

function HooksDialog({ onClose }: { onClose: () => void }) {
  const { data: p, isPending, error } = useQuery({ queryKey: ['hooks-preview-fresh'], queryFn: api.hooksPreview, gcTime: 0 })
  const [done, setDone] = useState<string>()
  const apply = useMutation({
    mutationFn: () => api.hooksApply(p!.action, p!.token),
    onSuccess: (r) => setDone(r.backupPath ? `Done. Backup saved to ${r.backupPath}` : 'Done.'),
  })
  const verb = p?.action === 'uninstall' ? 'Remove' : 'Enable'

  return (
    <ModalDialog
      title={`${verb} live status hooks`}
      onClose={onClose}
      actions={(close) => (
        <>
          <Button autoFocus onClick={close}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {p && !done && p.diff && (
            <Button variant="primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Writing…' : `${verb} hooks`}
            </Button>
          )}
        </>
      )}
    >
      {isPending && <p className="m-0 text-sm text-muted">Reading settings…</p>}
      {error && <p role="alert" className="m-0 text-sm text-error">{error.message}</p>}
      {p && (
        <>
          <p className="m-0 text-sm text-muted">
            This edits <code className="font-mono text-text">{p.settingsPath}</code> (only the <code className="font-mono">hooks</code> section; comments and your other hooks stay). Each hook POSTs a small event to{' '}
            <code className="font-mono">127.0.0.1</code> on this machine, and it never blocks Claude if Hangar is closed. A backup is saved first.
          </p>
          {p.diff ? <DiffView diff={p.diff} /> : <p className="m-0 text-sm text-muted">Nothing to change.</p>}
          {apply.error && <p role="alert" className="m-0 text-sm text-error">{apply.error.message}</p>}
          {done && <p className="m-0 break-all text-sm text-running">{done}</p>}
        </>
      )}
    </ModalDialog>
  )
}
