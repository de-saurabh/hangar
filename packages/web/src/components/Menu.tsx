import { useId, useRef, type ReactNode, type ToggleEvent } from 'react'

const ICON_TRIGGER = 'grid size-[34px] place-items-center rounded-lg text-muted hover:bg-hover hover:text-text'

interface Props {
  label: string
  trigger: ReactNode
  children: ReactNode
  /** Replaces the default square icon-button look of the trigger. */
  triggerClassName?: string
  width?: string
}

/**
 * A button that opens a small panel under it. Uses the native popover API, so
 * Esc, click-outside, focus return and top-layer stacking come from the browser.
 */
export function Menu({ label, trigger, children, triggerClassName = ICON_TRIGGER, width = 'w-72' }: Props) {
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
        className={`cursor-pointer border-0 bg-transparent ${triggerClassName}`}
      >
        {trigger}
      </button>
      <div
        id={id}
        popover="auto"
        onToggle={place}
        className={`fixed inset-auto m-0 ${width} rounded-[10px] border border-border bg-surface p-2 text-text shadow-lg`}
      >
        {children}
      </div>
    </>
  )
}
