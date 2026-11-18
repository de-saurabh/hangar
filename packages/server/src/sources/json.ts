import { readFile, stat } from 'node:fs/promises'
import { parse, type ParseError } from 'jsonc-parser'

export interface JsonFile {
  exists: boolean
  /** Short reason, never file content. */
  error?: string
  data?: unknown
}

const MAX_BYTES = 20_000_000

/**
 * Read a JSON (or JSONC) file, failing soft: a missing file is `exists: false`,
 * anything unreadable or invalid yields a short error and no data. Tolerates
 * comments and trailing commas.
 */
export async function readJsonFile(path: string): Promise<JsonFile> {
  let raw: string
  try {
    if ((await stat(path)).size > MAX_BYTES) return { exists: true, error: 'File too large' }
    raw = await readFile(path, 'utf8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { exists: false }
    return { exists: true, error: `Couldn't read file (${code ?? 'unknown error'})` }
  }
  const errors: ParseError[] = []
  const data: unknown = parse(raw, errors, { allowTrailingComma: true })
  if (errors.length > 0) return { exists: true, error: 'Invalid JSON' }
  return { exists: true, data }
}
