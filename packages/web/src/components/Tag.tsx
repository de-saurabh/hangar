import type { ReactNode } from 'react'

const TONE = {
  neutral: 'border-border text-muted',
  error: 'border-error/50 text-error',
  good: 'border-running/50 text-running',
} as const

/** A small label for a fact about something: "problem", "2 compactions", scope names. */
export function Tag({ tone = 'neutral', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 text-xs ${TONE[tone]}`}>{children}</span>
}
