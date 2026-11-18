import type { FileChange, SessionEvent, SessionSummary } from './session'

/** A session as listed by the API: the summary plus which repo it belongs to. */
export interface SessionListItem extends SessionSummary {
  /** Registered Hangar repo that contains the session's cwd, if any. */
  repoId?: string
  /** Registered repo name, else the last folder of the session's cwd. */
  repoName: string
}

export interface SessionDetail {
  session: SessionListItem
  events: SessionEvent[]
  /** True if the timeline was cut short to bound memory. */
  eventsTruncated: boolean
  files: FileChange[]
}

/** True if `child` is `parent` or inside it. Separator- and (on Windows) case-insensitive. */
export function isInside(child: string, parent: string, caseInsensitive = true): boolean {
  const norm = (p: string) => {
    const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
    return caseInsensitive ? n.toLowerCase() : n
  }
  const c = norm(child)
  const p = norm(parent)
  return p !== '' && (c === p || c.startsWith(p + '/'))
}

/** Last path segment of a Windows or POSIX path. */
export function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}
