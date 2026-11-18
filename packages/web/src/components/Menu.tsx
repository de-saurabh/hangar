import { useId, useRef, type ReactNode, type ToggleEvent } from 'react'

/**
 * A button that opens a small panel under it. Uses the native popover API, so
 * Esc, click-outside, focus return and top-layer stacking come from the browser.
 */
export function Menu({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)

  // The popover sits in the top layer, so anchor it to the button's position when it opens.
  const place = (e: ToggleEvent<HTMLDivElement>) => {
    if (e.newState !== 'open' || !button.current) return
    const r = button.current.getBoundingClientRect()
    e.currentTarget.style.top = `${r.bottom + 6}px`
    e.currentTarget.style.right = `${document.documentElement.clientWidth - r.right}px`
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-label={label}
        className="grid size-[34px] cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-muted hover:bg-hover hover:text-text"
      >
        {trigger}
      </button>
      <div
        id={id}
        popover="auto"
        onToggle={place}
        className="fixed inset-auto m-0 w-72 rounded-[10px] border border-border bg-surface p-2 text-text shadow-lg"
      >
        {children}
      </div>
    </>
  )
}
