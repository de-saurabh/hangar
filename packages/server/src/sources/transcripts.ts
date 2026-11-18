import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** A top-level session transcript: <claudeHome>/projects/<encoded-path>/<session-id>.jsonl */
export interface TranscriptFile {
  sessionId: string
  path: string
  /** The encoded project directory name (lossy: never decode, read `cwd` from lines). */
  projectDir: string
  size: number
  mtimeMs: number
}

const CHUNK = 4 * 1024 * 1024
/** A single line larger than this is skipped rather than buffered forever. */
const MAX_LINE_BYTES = 32 * 1024 * 1024

export async function discover(claudeHome: string): Promise<TranscriptFile[]> {
  const root = join(claudeHome, 'projects')
  let dirs
  try {
    dirs = await readdir(root, { withFileTypes: true })
  } catch {
    return [] // no projects dir yet: not an error
  }
  const out: TranscriptFile[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    let entries
    try {
      entries = await readdir(join(root, d.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue // skips <id>/ subdirs (subagents, etc.)
      const path = join(root, d.name, e.name)
      try {
        const info = await stat(path)
        out.push({ sessionId: e.name.slice(0, -'.jsonl'.length), path, projectDir: d.name, size: info.size, mtimeMs: info.mtimeMs })
      } catch {
        // vanished between readdir and stat
      }
    }
  }
  return out
}

export interface AdvanceResult {
  /** Lines handed to the callback this call. */
  lines: number
  /** The file shrank or was replaced, so `onReset` ran and parsing restarted from byte 0. */
  reset: boolean
  /** Lines that were not valid JSON (skipped). */
  badLines: number
}

/**
 * Incremental JSONL reader for one file. `advance()` reads only bytes added
 * since the last call, passes each complete, parsed line to `onLine`, and
 * leaves a half-written trailing line for next time. If the file is smaller
 * than before it calls `onReset` and starts over.
 */
export class TranscriptTail {
  private offset = 0

  constructor(
    readonly path: string,
    private readonly onLine: (parsed: unknown) => void,
    private readonly onReset: () => void,
  ) {}

  get bytesRead(): number {
    return this.offset
  }

  async advance(): Promise<AdvanceResult> {
    const size = (await stat(this.path)).size
    let reset = false
    if (size < this.offset) {
      this.onReset()
      this.offset = 0
      reset = true
    }
    if (size === this.offset) return { lines: 0, reset, badLines: 0 }

    let lines = 0
    let badLines = 0
    const feed = (text: string) => {
      if (text.trim() === '') return
      try {
        this.onLine(JSON.parse(text))
        lines++
      } catch {
        badLines++
      }
    }

    const handle = await open(this.path, 'r')
    try {
      let pos = this.offset
      let carry: Buffer = Buffer.alloc(0)
      while (pos < size) {
        const want = Math.min(CHUNK, size - pos)
        const chunk = Buffer.alloc(want)
        const { bytesRead } = await handle.read(chunk, 0, want, pos)
        if (bytesRead === 0) break
        pos += bytesRead
        const buf = carry.length > 0 ? Buffer.concat([carry, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead)
        const lastNl = buf.lastIndexOf(0x0a)
        if (lastNl === -1) {
          carry = buf
        } else {
          for (const l of buf.subarray(0, lastNl).toString('utf8').split('\n')) feed(l)
          carry = Buffer.from(buf.subarray(lastNl + 1))
        }
        if (carry.length > MAX_LINE_BYTES) {
          badLines++ // pathological line: drop it
          carry = Buffer.alloc(0)
        }
      }
      // A final line without a newline: consume it only if it is complete JSON.
      if (carry.length > 0) {
        const text = carry.toString('utf8')
        let complete = false
        try {
          JSON.parse(text)
          complete = true
        } catch {
          // still being written: leave it for the next advance()
        }
        if (complete) {
          feed(text)
          carry = Buffer.alloc(0)
        }
      }
      this.offset = pos - carry.length
    } finally {
      await handle.close()
    }
    return { lines, reset, badLines }
  }
}
