import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addRepo, configPath, defaultConfig, loadConfig, removeRepo, repoIdFor, RepoError, saveConfig } from '../src/config.js'

let home: string
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hangar-config-'))
  process.env.HANGAR_HOME = home
})
afterEach(async () => {
  delete process.env.HANGAR_HOME
  await rm(home, { recursive: true, force: true })
})

describe('loadConfig / saveConfig', () => {
  it('returns defaults when there is no file', async () => {
    expect(await loadConfig()).toEqual(defaultConfig())
  })

  it('round-trips and leaves no temp file behind', async () => {
    const c = defaultConfig()
    c.prefs.desktopAlerts = true
    await saveConfig(c)
    expect((await loadConfig()).prefs.desktopAlerts).toBe(true)
    expect((await readdir(home)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('copies a corrupt file aside instead of overwriting it, and returns defaults', async () => {
    await writeFile(configPath(), '{ not json', 'utf8')
    expect(await loadConfig()).toEqual(defaultConfig())
    const aside = (await readdir(home)).filter((n) => n.startsWith('config.json.corrupt-'))
    expect(aside).toHaveLength(1)
    expect(await readFile(join(home, aside[0]!), 'utf8')).toBe('{ not json')
  })

  it('treats a valid JSON file of the wrong shape as corrupt too', async () => {
    await writeFile(configPath(), JSON.stringify({ repos: 'nope' }), 'utf8')
    expect(await loadConfig()).toEqual(defaultConfig())
    expect((await readdir(home)).some((n) => n.includes('corrupt'))).toBe(true)
  })
})

describe('repos', () => {
  it('adds a repo with a stable id and its folder name, then removes it', async () => {
    const dir = join(home, 'my-repo')
    await mkdir(dir)
    const repo = await addRepo(dir)
    expect(repo).toMatchObject({ id: repoIdFor(dir), name: 'my-repo', path: dir })
    expect((await loadConfig()).repos.map((r) => r.id)).toEqual([repo.id])
    await removeRepo(repo.id)
    expect((await loadConfig()).repos).toEqual([])
  })

  it('rejects a missing folder, a file, and a duplicate', async () => {
    await expect(addRepo(join(home, 'nope'))).rejects.toMatchObject({ status: 400 })
    const file = join(home, 'a.txt')
    await writeFile(file, 'x')
    await expect(addRepo(file)).rejects.toBeInstanceOf(RepoError)
    const dir = join(home, 'r')
    await mkdir(dir)
    await addRepo(dir)
    await expect(addRepo(dir)).rejects.toMatchObject({ status: 409 })
  })

  it('answers 404 when removing a repo that is not there', async () => {
    await expect(removeRepo('missing')).rejects.toMatchObject({ status: 404 })
  })

  it('gives different paths different ids', () => {
    expect(repoIdFor('/a/b')).not.toBe(repoIdFor('/a/c'))
    expect(repoIdFor('/a/b')).toHaveLength(10)
  })
})
