import {
  applyLine,
  createSessionState,
  summarize,
  type FileChange,
  type SessionEvent,
  type SessionState,
  type SessionSummary,
} from '@hangar/shared'
import { discover, TranscriptTail, type TranscriptFile } from './sources/transcripts.js'

interface Holder {
  state: SessionState
}

interface Entry {
  file: TranscriptFile
  holder: Holder
  tail: TranscriptTail
  /** Size and mtime when last read, to skip untouched files cheaply. */
  seen: { size: number; mtimeMs: number }
}

export interface SessionDetailData {
  summary: SessionSummary
  events: SessionEvent[]
  eventsTruncated: boolean
  files: FileChange[]
}

const DETAIL_CACHE_SIZE = 3

function track(file: TranscriptFile, keepEvents: boolean) {
  const holder = { state: createSessionState(file.sessionId, { keepEvents }) }
  const tail = new TranscriptTail(
    file.path,
    (line) => applyLine(holder.state, line),
    () => {
      holder.state = createSessionState(file.sessionId, { keepEvents })
    },
  )
  return { holder, tail }
}

/**
 * In-memory index of every session transcript under <claudeHome>/projects.
 * The files stay the source of truth: refresh() only reads bytes appended
 * since last time, and a restart simply re-reads them (about 100 ms per
 * 30 MB). Message text is never kept for the list; the full timeline is
 * built on demand for the few sessions being viewed.
 */
export class SessionIndex {
  private entries = new Map<string, Entry>()
  private details = new Map<string, { tail: TranscriptTail; holder: Holder }>()
  private inflight?: Promise<void>
  private lastRefresh = 0

  constructor(
    private readonly claudeHome: string,
    private readonly minIntervalMs = 500,
  ) {}

  /** Bring the index up to date. Concurrent calls share one pass; calls within minIntervalMs are skipped. */
  refresh(): Promise<void> {
    if (this.inflight) return this.inflight
    if (Date.now() - this.lastRefresh < this.minIntervalMs) return Promise.resolve()
    this.inflight = this.doRefresh().finally(() => {
      this.lastRefresh = Date.now()
      this.inflight = undefined
    })
    return this.inflight
  }

  private async doRefresh(): Promise<void> {
    const files = await discover(this.claudeHome)
    const present = new Set(files.map((f) => f.path))
    for (const key of this.entries.keys()) if (!present.has(key)) this.entries.delete(key)

    for (const file of files) {
      let entry = this.entries.get(file.path)
      if (!entry) {
        const { holder, tail } = track(file, false)
        entry = { file, tail, holder, seen: { size: -1, mtimeMs: -1 } }
        this.entries.set(file.path, entry)
      }
      if (entry.seen.size === file.size && entry.seen.mtimeMs === file.mtimeMs) continue
      try {
        await entry.tail.advance()
        entry.seen = { size: file.size, mtimeMs: file.mtimeMs }
        entry.file = file
      } catch {
        this.entries.delete(file.path) // unreadable or vanished: drop, retry on the next pass
      }
    }
  }

  /** Summaries of all sessions that have any conversation in them. */
  summaries(): SessionSummary[] {
    return [...this.entries.values()]
      .map((e) => summarize(e.holder.state))
      .filter((s) => s.lastEventAt !== undefined)
      .sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''))
  }

  /** Full timeline for one session; the newest file wins if an id appears twice. */
  async detail(id: string): Promise<SessionDetailData | undefined> {
    await this.refresh()
    const candidates = [...this.entries.values()].filter((e) => e.file.sessionId === id)
    const entry = candidates.sort((a, b) => b.file.mtimeMs - a.file.mtimeMs)[0]
    if (!entry) return undefined

    let cached = this.details.get(entry.file.path)
    if (cached) {
      this.details.delete(entry.file.path) // refresh LRU position
    } else {
      cached = track(entry.file, true)
    }
    this.details.set(entry.file.path, cached)
    while (this.details.size > DETAIL_CACHE_SIZE) this.details.delete(this.details.keys().next().value as string)

    try {
      await cached.tail.advance()
    } catch {
      this.details.delete(entry.file.path)
      return undefined
    }
    const state = cached.holder.state
    return {
      summary: summarize(state),
      events: state.events,
      eventsTruncated: state.eventsTruncated,
      files: [...state.files.values()],
    }
  }
}
