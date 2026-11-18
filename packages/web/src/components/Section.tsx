import type { ReactNode } from 'react'

/** A summary block: open, with a rule on top. Not a card. `action` is a quiet link on the right. */
export function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 border-t border-border pt-3.5">
      <h2 className="m-0 mb-2.5 flex items-center gap-2 text-[15px] font-semibold">
        {title}
        {count !== undefined && count > 0 && <span className="font-normal text-dim">{count}</span>}
        {action && <span className="ml-auto text-[13px] font-medium">{action}</span>}
      </h2>
      {children}
    </section>
  )
}

export const EmptyLine = ({ children }: { children: ReactNode }) => <p className="m-0 py-1 text-[13.5px] text-dim">{children}</p>
