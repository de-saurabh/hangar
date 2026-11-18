import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import type { LiveState, SessionListItem } from '@hangar/shared'
import { api } from '../../api'
import { buttonClass, Button, CopyButton } from '../../components/Button'
import { resumeCommand } from '../../components/SessionCard'
import { contextPct, formatCost, shortModel } from '../../format'
import { isActive } from '../../live'
import { elapsed } from '../../time'

const RECENT_EVENTS = 8

interface Props {
  session: SessionListItem | undefined
  live: LiveState | undefined
  onClose: () => void
}

/**
 * Quick look at one session without leaving the Dashboard. A non-modal
 * top-layer panel: the board behind it stays usable, Esc or the close button
 * dismiss it, and the browser handles stacking.
 */
export function SessionPanel({ session, live, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = session !== undefined

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const isOpen = el.matches(':popover-open')
    if (open && !isOpen) el.showPopover()
    if (!open && isOpen) el.hidePopover()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const detail = useQuery({ queryKey: ['session', session?.id], queryFn: () => api.session(session!.id), enabled: open })
  const events = (detail.data?.events ?? []).slice(-RECENT_EVENTS).reverse()
  const pct = session ? contextPct(session) : undefined
  const wants = live?.status === 'waiting' ? live.detail : undefined

  return (
    <dialog
      ref={ref}
      popover="manual"
      aria-labelledby="panel-title"
      className="side-panel fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[440px] max-w-full overflow-auto border-0 border-l border-border bg-surface p-6 text-text shadow-2xl"
    >
      {session && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-muted">
            <span>{live && isActive(live) ? `${live.status} · ${elapsed(live.since)}` : 'Finished'}</span>
            <Button variant="quiet" className="ml-auto" onClick={onClose} aria-label="Close panel">
              Close
            </Button>
          </div>
          <div>
            <h2 id="panel-title" className="m-0 text-xl font-semibold leading-snug">
              {session.title}
            </h2>
            <p className="m-0 mt-1 text-muted">
              {session.repoName}
              {session.gitBranch && ` · ${session.gitBranch}`}
            </p>
          </div>
          {wants && (
            <div>
              <p className="m-0 mb-1.5 text-muted">Wants to run</p>
              <code className="block break-all rounded-[7px] border border-border bg-bg px-3 py-2.5 font-mono text-[13px]">{wants}</code>
            </div>
          )}
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            <Fact label="Model" value={shortModel(session.model)} />
            <Fact label="Context" value={pct === undefined ? '—' : `${pct}% used`} />
            <Fact label="Cost" value={formatCost(session.costUSD)} />
            {session.compactions > 0 && <Fact label="Compactions" value={String(session.compactions)} />}
          </dl>
          <div>
            <h3 className="m-0 mb-1.5 text-[13px] font-semibold text-muted">Recent activity</h3>
            {detail.isPending && <p className="m-0 text-[13.5px] text-dim">Loading…</p>}
            {detail.isError && <p className="m-0 text-[13.5px] text-error">Couldn't read this session's activity.</p>}
            <ul className="m-0 list-none p-0">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 border-t border-border py-1.5 text-[13.5px] first:border-t-0">
                  <span className={`w-16 flex-none text-xs font-semibold ${e.failed ? 'text-error' : 'text-dim'}`}>{e.label}</span>
                  <span className="min-w-0 break-words">{e.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-2">
            <CopyButton variant="primary" text={resumeCommand(session.id)} label="Copy resume command" />
            <Link to="/sessions/$sessionId" params={{ sessionId: session.id }} className={buttonClass()}>
              View full timeline
            </Link>
          </div>
        </div>
      )}
    </dialog>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0">{value}</dd>
    </>
  )
}
