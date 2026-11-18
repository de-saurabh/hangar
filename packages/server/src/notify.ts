import { lastSegment } from '@hangar/shared'
import type { LiveTransition } from './live.js'

export type Sender = (title: string, message: string) => void

/** Sends an OS notification through toasted-notifier. Never throws; a missing/blocked notifier is silent. */
export const desktopSender: Sender = (title, message) => {
  void import('toasted-notifier')
    .then((m) => m.default.notify({ title, message, sound: false }))
    .catch(() => undefined)
}

/**
 * Turns "session started waiting" transitions into at most one alert per
 * session per `cooldownMs`. The caller decides whether alerts are enabled.
 */
export function createAlerter(send: Sender, cooldownMs = 30_000, now: () => number = Date.now) {
  const last = new Map<string, number>()
  return (t: LiveTransition): boolean => {
    if (t.to !== 'waiting') return false
    const prev = last.get(t.sessionId)
    const at = now()
    if (prev !== undefined && at - prev < cooldownMs) return false
    last.set(t.sessionId, at)
    send(`${t.cwd ? lastSegment(t.cwd) : 'A Claude session'} needs you`, t.detail ?? 'Waiting for your input')
    return true
  }
}
