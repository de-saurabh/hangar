import { EventEmitter } from 'node:events'
import { applyHook, resolveStatus, type HookPayload, type LiveState, type RegistryEntry } from '@hangar/shared'
import { read as readRegistry } from './sources/registry.js'

export interface LiveTransition {
  sessionId: string
  from: LiveState['status'] | undefined
  to: LiveState['status']
  detail?: string
  cwd?: string
}

/** Hook states are dropped after this long without events, once the registry says the process is gone. */
const FORGET_FINISHED_MS = 24 * 60 * 60_000

/**
 * Live session state. Hook events arrive through `ingest`; `poll` re-reads
 * the registry (cheap) and publishes a snapshot / transitions when anything
 * changed. Hook payloads are reduced to a few fields immediately: tool
 * output and prompt text are never stored.
 */
export class LiveStore extends EventEmitter {
  private hooks = new Map<string, LiveState>()
  private registry: RegistryEntry[] = []
  private last = new Map<string, LiveState>()
  private timer?: NodeJS.Timeout
  hooksSeen = 0

  constructor(
    private readonly claudeHome: string,
    private readonly now: () => number = Date.now,
  ) {
    super()
  }

  ingest(payload: HookPayload): void {
    const id = typeof payload.session_id === 'string' ? payload.session_id : undefined
    if (!id) return
    const next = applyHook(this.hooks.get(id), payload, this.now())
    if (next) {
      this.hooks.set(id, next)
      this.hooksSeen++
    }
    this.publish()
  }

  snapshot(): LiveState[] {
    const now = this.now()
    const ids = new Set([...this.hooks.keys(), ...this.registry.map((r) => r.sessionId)])
    const out: LiveState[] = []
    for (const id of ids) {
      const reg = this.registry.find((r) => r.sessionId === id)
      const s = resolveStatus(this.hooks.get(id), reg, now)
      if (s) out.push(s)
    }
    return out.sort((a, b) => b.lastEventAt - a.lastEventAt)
  }

  async poll(): Promise<void> {
    this.registry = await readRegistry(this.claudeHome)
    const now = this.now()
    for (const [id, s] of this.hooks) {
      const reg = this.registry.find((r) => r.sessionId === id)
      if (!reg && s.status === 'finished' && now - s.lastEventAt > FORGET_FINISHED_MS) this.hooks.delete(id)
    }
    this.publish()
  }

  start(intervalMs = 3000): void {
    void this.poll()
    this.timer = setInterval(() => void this.poll(), intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private publish(): void {
    const snap = this.snapshot()
    const next = new Map(snap.map((s) => [s.sessionId, s]))
    let changed = next.size !== this.last.size
    for (const [id, s] of next) {
      const prev = this.last.get(id)
      if (!prev || prev.status !== s.status || prev.detail !== s.detail) {
        changed = true
        if (!prev || prev.status !== s.status) {
          const t: LiveTransition = { sessionId: id, from: prev?.status, to: s.status, ...(s.detail ? { detail: s.detail } : {}), ...(s.cwd ? { cwd: s.cwd } : {}) }
          // The first poll just discovers existing sessions: not a transition worth alerting.
          if (this.last.size > 0 || this.hooksSeen > 0) this.emit('transition', t)
        }
      }
    }
    this.last = next
    if (changed) this.emit('update', snap)
  }
}
