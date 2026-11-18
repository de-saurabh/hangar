/** Helpers that keep secrets out of anything Hangar returns or logs. */

/**
 * Reduce a URL to origin + path: drops credentials (user:pass@), the query
 * string and the fragment, which is where tokens usually live. Falls back to
 * cutting at `?`/`#` if the URL doesn't parse.
 */
export function safeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return raw.replace(/^[^@/]*@/, '').split(/[?#]/)[0] ?? ''
  }
}

/** Truncate for display, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
