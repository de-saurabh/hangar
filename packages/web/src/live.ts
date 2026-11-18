import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { LiveState } from '@hangar/shared'
import { api } from './api'

export interface Transition {
  sessionId: string
  from?: LiveState['status']
  to: LiveState['status']
  detail?: string
  cwd?: string
}

const NOTIFY_KEY = 'hangar.notify'

export function notifyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted'
  } catch {
    return false
  }
}

/** Turn browser alerts on (asks permission) or off. Returns the resulting state. */
export async function setNotify(on: boolean): Promise<boolean> {
  try {
    if (on) {
      if (typeof Notification === 'undefined') return false
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (perm !== 'granted') return false
      localStorage.setItem(NOTIFY_KEY, '1')
      return true
    }
    localStorage.setItem(NOTIFY_KEY, '0')
  } catch {
    // storage blocked: alerts simply stay off
  }
  return false
}

const folder = (p?: string) => p?.split(/[\\/]/).filter(Boolean).pop() ?? 'A session'

/**
 * One EventSource for the whole app: keeps the ['live'] query fresh, refreshes
 * session lists when something changes, and raises a browser notification when
 * a session starts waiting for you. Mounted once, in the layout.
 */
export function useLiveFeed(): void {
  const qc = useQueryClient()
  const alerted = useRef(new Map<string, number>())

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const es = new EventSource('/api/events')
    es.addEventListener('live', (e) => {
      qc.setQueryData(['live'], JSON.parse((e as MessageEvent<string>).data) as LiveState[])
    })
    es.addEventListener('transition', (e) => {
      const t = JSON.parse((e as MessageEvent<string>).data) as Transition
      void qc.invalidateQueries({ queryKey: ['sessions'] })
      if (t.to === 'waiting' && notifyEnabled()) {
        // One alert per session per 30 s, so a burst of prompts is not a burst of toasts.
        const last = alerted.current.get(t.sessionId) ?? 0
        if (Date.now() - last > 30_000) {
          alerted.current.set(t.sessionId, Date.now())
          try {
            new Notification(`${folder(t.cwd)} needs you`, { body: t.detail ?? 'Waiting for your input', tag: t.sessionId })
          } catch {
            // some browsers only allow notifications from a service worker
          }
        }
      }
    })
    return () => es.close()
  }, [qc])
}

export function useLive(): Map<string, LiveState> {
  const { data } = useQuery({ queryKey: ['live'], queryFn: api.live, staleTime: Infinity })
  return new Map((data ?? []).map((s) => [s.sessionId, s]))
}
