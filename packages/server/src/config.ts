import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { HangarConfigSchema, type HangarConfig, type Repo } from '@hangar/shared'

/** Hangar's own state dir. Override with HANGAR_HOME (used by tests). */
export function hangarHome(): string {
  return process.env.HANGAR_HOME ?? join(homedir(), '.hangar')
}

export function configPath(): string {
  return join(hangarHome(), 'config.json')
}

export function defaultConfig(): HangarConfig {
  return HangarConfigSchema.parse({})
}

/**
 * Load ~/.hangar/config.json. Fails soft: a missing file gives defaults; an
 * unreadable/invalid file is copied aside (never overwritten silently) and
 * defaults are returned.
 */
export async function loadConfig(): Promise<HangarConfig> {
  const file = configPath()
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig()
    throw err
  }
  try {
    const parsed = HangarConfigSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // fall through to backup
  }
  await copyFile(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined)
  return defaultConfig()
}

/** Atomic write (temp file + rename) so a crash never leaves a half-written config. */
export async function saveConfig(config: HangarConfig): Promise<void> {
  const file = configPath()
  await mkdir(hangarHome(), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await rename(tmp, file)
}

export function repoIdFor(absPath: string): string {
  const key = process.platform === 'win32' ? absPath.toLowerCase() : absPath
  return createHash('sha1').update(key).digest('hex').slice(0, 10)
}

export class RepoError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message)
  }
}

export async function addRepo(inputPath: string): Promise<Repo> {
  const abs = resolve(inputPath)
  const info = await stat(abs).catch(() => undefined)
  if (!info?.isDirectory()) throw new RepoError(`Not a directory: ${abs}`, 400)

  const config = await loadConfig()
  const id = repoIdFor(abs)
  if (config.repos.some((r) => r.id === id)) throw new RepoError('Repo already added', 409)

  const repo: Repo = { id, path: abs, name: basename(abs) || abs, addedAt: new Date().toISOString() }
  config.repos.push(repo)
  await saveConfig(config)
  return repo
}

export async function removeRepo(id: string): Promise<void> {
  const config = await loadConfig()
  const next = config.repos.filter((r) => r.id !== id)
  if (next.length === config.repos.length) throw new RepoError('Repo not found', 404)
  await saveConfig({ ...config, repos: next })
}
