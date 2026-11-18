import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-end gap-4">
      <div>
        <h1 className="m-0 text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="m-0 mt-0.5 text-muted">{subtitle}</p>}
      </div>
      <span className="flex-1" />
      {children}
    </div>
  )
}
