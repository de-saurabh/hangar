import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import {
  AddRepoBodySchema,
  effectiveSettings,
  flatten,
  isInside,
  lastSegment,
  maskSensitiveValues,
  SCOPE_PRECEDENCE,
  type HealthResponse,
  type Repo,
  type RepoView,
  type SessionDetail,
  type SessionListItem,
  type SessionSummary,
} from '@hangar/shared'
import { addRepo, loadConfig, removeRepo, RepoError } from './config.js'
import { read as readMemory } from './sources/claudeMd.js'
import { defaultClaudeJsonPath, read as readMcp } from './sources/mcp.js'
import { claudeHome, read as readSettings } from './sources/settings.js'
import { SessionIndex } from './sessions.js'

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i

function isLoopbackOrigin(origin: string): boolean {
  try {
    return LOOPBACK_HOST.test(new URL(origin).host)
  } catch {
    return false
  }
}

/**
 * DNS-rebinding / CSRF guard. Hangar only listens on 127.0.0.1, but a hostile
 * web page could still point a DNS name at it or fire cross-site requests.
 * Reject any request whose Host (or Origin, if sent) is not loopback.
 */
const loopbackOnly: RequestHandler = (req, res, next) => {
  const host = req.headers.host ?? ''
  const origin = req.headers.origin
  if (!LOOPBACK_HOST.test(host) || (origin !== undefined && !isLoopbackOrigin(origin))) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export interface AppOptions {
  version: string
  /** Directory with the built web app. If missing, only the API is served. */
  webDir?: string
  /** Claude Code config dir; defaults to CLAUDE_CONFIG_DIR or ~/.claude. */
  claudeHome?: string
}

/** Attach the registered repo containing the session's cwd (most specific wins). */
function withRepo(s: SessionSummary, repos: Repo[]): SessionListItem {
  const match = s.cwd
    ? repos.filter((r) => isInside(s.cwd as string, r.path)).sort((a, b) => b.path.length - a.path.length)[0]
    : undefined
  return {
    ...s,
    ...(match ? { repoId: match.id } : {}),
    repoName: match?.name ?? (s.cwd ? lastSegment(s.cwd) : 'unknown'),
  }
}

export function createApp(opts: AppOptions) {
  const sessions = new SessionIndex(opts.claudeHome ?? claudeHome())
  const app = express()
  app.disable('x-powered-by')
  app.use(loopbackOnly)
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      version: opts.version,
      claudeHomeFound: existsSync(join(homedir(), '.claude')),
    }
    res.json(body)
  })

  app.get('/api/repos', async (_req, res) => {
    const { repos } = await loadConfig()
    const views: RepoView[] = await Promise.all(
      repos.map(async (r) => ({
        ...r,
        exists: (await stat(r.path).catch(() => undefined))?.isDirectory() ?? false,
      })),
    )
    res.json(views)
  })

  app.post('/api/repos', async (req, res) => {
    const body = AddRepoBodySchema.safeParse(req.body)
    if (!body.success) throw new RepoError('Body must be { "path": string }', 400)
    res.status(201).json(await addRepo(body.data.path))
  })

  app.delete('/api/repos/:id', async (req, res) => {
    await removeRepo(String(req.params.id))
    res.status(204).end()
  })

  app.get('/api/repos/:id/settings', async (req, res) => {
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    const layers = await readSettings({ claudeHome: opts.claudeHome ?? claudeHome(), repoPath: repo.path })
    const eff = effectiveSettings(layers)
    // Secret-looking values never leave the server unless explicitly revealed below.
    res.json({ ...eff, values: maskSensitiveValues(eff.values) })
  })

  /** Explicit "Reveal" for one masked value. Only ever called by a user click. */
  app.get('/api/repos/:id/settings/value', async (req, res) => {
    const key = typeof req.query.key === 'string' ? req.query.key : ''
    const scope = SCOPE_PRECEDENCE.find((s) => s === req.query.scope)
    if (!key || !scope) throw new RepoError('Query must include key and a valid scope', 400)
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    const layers = await readSettings({ claudeHome: opts.claudeHome ?? claudeHome(), repoPath: repo.path })
    const data = layers.find((l) => l.scope === scope)?.data
    const flat = data ? flatten(data) : undefined
    if (!flat?.has(key)) throw new RepoError('Setting not found', 404)
    res.set('Cache-Control', 'no-store').json({ value: flat.get(key) })
  })

  app.get('/api/repos/:id/memory', async (req, res) => {
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    res.json(await readMemory({ claudeHome: opts.claudeHome ?? claudeHome(), repoPath: repo.path }))
  })

  app.get('/api/repos/:id/mcp', async (req, res) => {
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    const claudeJsonPath = opts.claudeHome ? join(opts.claudeHome, '.claude.json') : defaultClaudeJsonPath()
    res.json(await readMcp({ claudeJsonPath, repoPath: repo.path }))
  })

  app.get('/api/sessions', async (req, res) => {
    await sessions.refresh()
    const { repos } = await loadConfig()
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : ''
    let list = sessions.summaries()
    if (q.trim()) {
      const rank = new Map(sessions.search(q).map((id, i) => [id, i]))
      list = list.filter((s) => rank.has(s.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
    }
    res.json(list.map((s) => withRepo(s, repos)))
  })

  app.get('/api/sessions/:id', async (req, res) => {
    const d = await sessions.detail(String(req.params.id))
    if (!d) throw new RepoError('Session not found', 404)
    const { repos } = await loadConfig()
    const body: SessionDetail = {
      session: withRepo(d.summary, repos),
      events: d.events,
      eventsTruncated: d.eventsTruncated,
      files: d.files,
    }
    res.set('Cache-Control', 'no-store').json(body)
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    const webDir = opts.webDir
    app.use(express.static(webDir))
    // SPA fallback for client-side routes.
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      res.sendFile(join(webDir, 'index.html'))
    })
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof RepoError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }
    // Never log request bodies or transcript content; message only.
    console.error('[hangar] internal error:', err instanceof Error ? err.message : 'unknown')
    res.status(500).json({ error: 'Internal error' })
  }
  app.use(onError)

  return app
}
