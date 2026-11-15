import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import { AddRepoBodySchema, type HealthResponse, type RepoView } from '@hangar/shared'
import { addRepo, loadConfig, removeRepo, RepoError } from './config.js'

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
}

export function createApp(opts: AppOptions) {
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
