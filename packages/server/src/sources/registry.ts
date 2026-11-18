import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RegistryEntry } from '@hangar/shared'

/** True if a process with this pid exists (EPERM means it exists but is not ours). */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Live session registry: <claudeHome>/sessions/<pid>.json. Only `.json`
 * files are opened (never `*.key`), and only the fields Hangar needs are
 * kept. Unreadable or odd files are skipped.
 */
export async function read(claudeHome: string, alive: (pid: number) => boolean = isAlive): Promise<RegistryEntry[]> {
  const dir = join(claudeHome, 'sessions')
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const out: RegistryEntry[] = []
  for (const name of names) {
    try {
      const o = JSON.parse(await readFile(join(dir, name), 'utf8')) as Record<string, unknown>
      const pid = typeof o.pid === 'number' ? o.pid : Number.parseInt(name, 10)
      const sessionId = typeof o.sessionId === 'string' ? o.sessionId : undefined
      if (!sessionId || !Number.isFinite(pid)) continue
      out.push({
        sessionId,
        pid,
        alive: alive(pid),
        ...(typeof o.status === 'string' ? { status: o.status } : {}),
        ...(typeof o.cwd === 'string' ? { cwd: o.cwd } : {}),
        ...(typeof o.name === 'string' ? { name: o.name } : {}),
      })
    } catch {
      // partial write or not JSON: skip, it will be right next time
    }
  }
  return out
}
