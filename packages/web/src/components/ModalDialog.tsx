import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  /** Called after the dialog has closed, however it was closed (button, Esc). */
  onClose: () => void
  children: ReactNode
  /** The buttons. Call `close` from a "Cancel" or "Close" button. */
  actions: (close: () => void) => ReactNode
}

/**
 * A native modal dialog for "review this, then confirm" flows. The browser
 * provides the focus trap, Esc, the backdrop and returning focus, so none of
 * that is rebuilt here.
 */
export function ModalDialog({ title, onClose, children, actions }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby={titleId} className="m-auto w-[min(860px,92vw)] rounded-[14px] border border-border bg-surface p-0 text-text backdrop:bg-black/60">
      <div className="flex flex-col gap-3 p-5">
        <h2 id={titleId} className="m-0 text-lg font-semibold">
          {title}
        </h2>
        {children}
        <div className="flex justify-end gap-2">{actions(() => ref.current?.close())}</div>
      </div>
    </dialog>
  )
}
