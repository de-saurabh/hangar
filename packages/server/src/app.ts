import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import express, { type ErrorRequestHandler, type RequestHandler } from 'express'
import {
  AddRepoBodySchema,
  effectiveSettings,
  flatten,
  maskSensitiveValues,
  SCOPE_PRECEDENCE,
  buildStuck,
  scanSecrets,
  type SecretFinding,
  type SecretsResponse,
  isInside,
  lintMemory,
  buildUsageInsights,
  localDateKey,
  PrefsPatchSchema,
  type InsightsSummary,
  type ShippedItem,
  type UsageInsightsResponse,
  type HealthResponse,
  type RepoView,
  type SessionDetail,
} from '@hangar/shared'
import { addRepo, loadConfig, removeRepo, RepoError, saveConfig } from './config.js'
import { read as readMemory, readForLint as readMemoryForLint } from './sources/claudeMd.js'
import { defaultClaudeJsonPath, read as readMcp } from './sources/mcp.js'
import { claudeHome, read as readSettings } from './sources/settings.js'
import { SessionIndex, withRepo } from './sessions.js'
import { buildDashboard } from './dashboard.js'
import { LiveStore } from './live.js'
import { discoverFiles, discoverHooks, publicItem } from './sources/library.js'
import { CopyError, planCopy, type CopyTarget } from './libraryCopy.js'
import { applyFiles, previewFiles } from './settingsWrite.js'
import { planTemplate, TEMPLATES } from './templates.js'
import { runBackup, status as backupStatus } from './backup.js'
import { ApprovalTracker } from './approvals.js'
import { AllowlistError, applyAdd, isAllowed, previewAdd, targetPath, type AllowTarget } from './allowlist.js'
import { recentCommits } from './sources/gitHistory.js'
import { createAlerter, desktopSender } from './notify.js'
import { apply as applyHooks, preview as previewHooks, SettingsParseError, StaleTokenError } from './hookInstall.js'

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
  /** Start background polling of the live registry. The CLI sets this; tests leave it off. */
  startLive?: boolean
  /** Override the desktop notification sender (tests). */
  sendDesktop?: (title: string, message: string) => void
}

export function createApp(opts: AppOptions) {
  const sessions = new SessionIndex(opts.claudeHome ?? claudeHome())
  const live = new LiveStore(opts.claudeHome ?? claudeHome())
  const approvals = new ApprovalTracker()
  if (opts.startLive) {
    live.start()
    // Desktop alerts: opt-in, works with the browser tab closed.
    const alert = createAlerter(opts.sendDesktop ?? desktopSender)
    live.on('transition', (t) => {
      void loadConfig().then((c) => {
        if (c.prefs.desktopAlerts) alert(t)
      })
    })
  }
  const app = express()
  app.disable('x-powered-by')
  app.use(loopbackOnly)
  // Hook payloads can carry whole file contents (Write tool input), so they get a roomier parser.
  // Always answer 200 {}: Hangar must never make a Claude Code hook fail.
  const hookBody = express.json({ limit: '25mb', strict: false })
  const hookIngest: RequestHandler = (req, res) => {
    if (typeof req.body === 'object' && req.body !== null) {
      live.ingest(req.body)
      void approvals.ingest(req.body).catch(() => undefined)
    }
    res.json({})
  }
  // Unparseable body: still 200, so the hook shows no error.
  const hookLenient: ErrorRequestHandler = (_err, _req, res, _next) => {
    res.json({})
  }
  app.post('/api/hook', hookBody, hookIngest, hookLenient)
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

  app.get('/api/repos/:id/lint', async (req, res) => {
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    const files = await readMemoryForLint({ claudeHome: opts.claudeHome ?? claudeHome(), repoPath: repo.path })
    const findings = lintMemory({
      files,
      exists: (p, baseDir) => {
        const abs = resolve(baseDir, p)
        // Only look inside the repo: a reference like ../../etc/x is out of scope, not stale.
        return !isInside(abs, baseDir) || existsSync(abs)
      },
    })
    res.set('Cache-Control', 'no-store').json({ findings, filesChecked: files.length })
  })

  /** Where credentials sit in the files Claude Code reads for this repo. Reports file/line/kind only, never values. */
  app.get('/api/repos/:id/secrets', async (req, res) => {
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    const home = opts.claudeHome ?? claudeHome()
    const targets: { path: string; label: string; shared: boolean }[] = [
      { path: join(home, 'settings.json'), label: '~/.claude/settings.json', shared: false },
      { path: join(home, 'CLAUDE.md'), label: '~/.claude/CLAUDE.md', shared: false },
      { path: join(repo.path, 'CLAUDE.md'), label: `${repo.name}/CLAUDE.md`, shared: true },
      { path: join(repo.path, 'CLAUDE.local.md'), label: `${repo.name}/CLAUDE.local.md`, shared: false },
      { path: join(repo.path, '.mcp.json'), label: `${repo.name}/.mcp.json`, shared: true },
      { path: join(repo.path, '.claude', 'settings.json'), label: `${repo.name}/.claude/settings.json`, shared: true },
      { path: join(repo.path, '.claude', 'settings.local.json'), label: `${repo.name}/.claude/settings.local.json`, shared: false },
    ]
    const findings: SecretFinding[] = []
    let filesChecked = 0
    for (const t of targets) {
      try {
        if ((await stat(t.path)).size > 2_000_000) continue
        const text = await readFile(t.path, 'utf8')
        filesChecked++
        for (const h of scanSecrets(text)) findings.push({ ...h, file: t.label, shared: t.shared })
      } catch {
        // missing or unreadable: nothing to scan
      }
    }
    const body: SecretsResponse = { findings, filesChecked }
    res.set('Cache-Control', 'no-store').json(body)
  })

  app.get('/api/repos/:id/mcp', async (req, res) => {
    const { repos } = await loadConfig()
    const repo = repos.find((r) => r.id === req.params.id)
    if (!repo) throw new RepoError('Repo not found', 404)
    const claudeJsonPath = opts.claudeHome ? join(opts.claudeHome, '.claude.json') : defaultClaudeJsonPath()
    res.json(await readMcp({ claudeJsonPath, repoPath: repo.path }))
  })

  /** Preview of installing (or removing) Hangar's hooks. Read-only. */
  app.get('/api/hooks/install', async (req, res) => {
    const port = req.socket.localPort ?? 0
    try {
      res.set('Cache-Control', 'no-store').json(await previewHooks(opts.claudeHome ?? claudeHome(), port))
    } catch (e) {
      if (e instanceof SettingsParseError) throw new RepoError(e.message, 422)
      throw e
    }
  })

  /** The only write Hangar makes to ~/.claude: needs the token of the preview the user saw. */
  app.post('/api/hooks/install', async (req, res) => {
    const body = req.body as { action?: unknown; token?: unknown } | undefined
    if ((body?.action !== 'install' && body?.action !== 'uninstall') || typeof body.token !== 'string') {
      throw new RepoError('Body must be { "action": "install" | "uninstall", "token": string }', 400)
    }
    try {
      res.json(await applyHooks(opts.claudeHome ?? claudeHome(), req.socket.localPort ?? 0, body.action, body.token))
    } catch (e) {
      if (e instanceof StaleTokenError) throw new RepoError(e.message, 409)
      if (e instanceof SettingsParseError) throw new RepoError(e.message, 422)
      throw e
    }
  })

  app.get('/api/insights/allowlist', async (_req, res) => {
    const home = opts.claudeHome ?? claudeHome()
    const { repos } = await loadConfig()
    const all = await approvals.suggestions(repos, () => false)
    const kept = []
    for (const s of all) {
      const sc = s.scope
      const repo = sc === 'global' ? undefined : repos.find((r) => r.id === sc.repoId)
      if (!(await isAllowed(home, s.rule, repo))) kept.push(s)
    }
    res.set('Cache-Control', 'no-store').json({ suggestions: kept })
  })

  const resolveAllow = async (rule: unknown, scope: unknown, repoId: unknown): Promise<{ rule: string; path: string }> => {
    if (typeof rule !== 'string' || (scope !== 'global' && scope !== 'repo')) throw new RepoError('Body must be { "rule": string, "scope": "global" | "repo", "repoId"?: string }', 400)
    let target: AllowTarget = { scope: 'global' }
    if (scope === 'repo') {
      const repo = (await loadConfig()).repos.find((r) => r.id === repoId)
      if (!repo) throw new RepoError('Repo not found', 404)
      target = { scope: 'repo', repo }
    }
    return { rule, path: targetPath(opts.claudeHome ?? claudeHome(), target) }
  }

  /** Diff of adding one allow rule. Read-only. */
  app.post('/api/insights/allowlist/preview', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    const { rule, path } = await resolveAllow(b.rule, b.scope, b.repoId)
    try {
      res.set('Cache-Control', 'no-store').json(await previewAdd(path, rule))
    } catch (e) {
      if (e instanceof AllowlistError) throw new RepoError(e.message, 422)
      throw e
    }
  })

  /** Writes the rule; needs the token of the preview the user saw. Backs the file up first. */
  app.post('/api/insights/allowlist/apply', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    if (typeof b.token !== 'string') throw new RepoError('Body must include the preview token', 400)
    const { rule, path } = await resolveAllow(b.rule, b.scope, b.repoId)
    try {
      res.json(await applyAdd(path, rule, b.token))
    } catch (e) {
      if (e instanceof StaleTokenError) throw new RepoError(e.message, 409)
      if (e instanceof AllowlistError) throw new RepoError(e.message, 422)
      throw e
    }
  })

  app.get('/api/library', async (_req, res) => {
    const home = opts.claudeHome ?? claudeHome()
    const { repos } = await loadConfig()
    const [files, hooks] = await Promise.all([discoverFiles(home, repos), discoverHooks(home, repos)])
    res.set('Cache-Control', 'no-store').json({ items: [...files.map(publicItem), ...hooks] })
  })

  const resolveCopy = async (b: Record<string, unknown>) => {
    if (typeof b.itemId !== 'string' || (b.scope !== 'global' && b.scope !== 'repo')) throw new RepoError('Body must be { "itemId": string, "scope": "global" | "repo", "repoId"?: string }', 400)
    const home = opts.claudeHome ?? claudeHome()
    const { repos } = await loadConfig()
    const item = (await discoverFiles(home, repos)).find((i) => i.id === b.itemId)
    if (!item) throw new RepoError('Library item not found', 404)
    let target: CopyTarget = { scope: 'global' }
    if (b.scope === 'repo') {
      const repo = repos.find((r) => r.id === b.repoId)
      if (!repo) throw new RepoError('Repo not found', 404)
      target = { scope: 'repo', repo }
    }
    try {
      return await planCopy(item, home, target)
    } catch (e) {
      if (e instanceof CopyError) throw new RepoError(e.message, e.status)
      throw e
    }
  }

  /** Diff of copying a command, agent or skill to a repo or to ~/.claude. Read-only. */
  app.post('/api/library/copy/preview', async (req, res) => {
    const edits = await resolveCopy((req.body ?? {}) as Record<string, unknown>)
    res.set('Cache-Control', 'no-store').json(await previewFiles(edits))
  })

  /** Writes the copy; needs the token of the preview the user saw. Overwritten files are backed up. */
  app.post('/api/library/copy/apply', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    if (typeof b.token !== 'string') throw new RepoError('Body must include the preview token', 400)
    const edits = await resolveCopy(b)
    try {
      res.json(await applyFiles(edits, b.token))
    } catch (e) {
      if (e instanceof StaleTokenError) throw new RepoError(e.message, 409)
      throw e
    }
  })

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: TEMPLATES.map(({ id, name, summary }) => ({ id, name, summary })) })
  })

  const resolveTemplate = async (b: Record<string, unknown>) => {
    const t = TEMPLATES.find((x) => x.id === b.templateId)
    if (!t) throw new RepoError('Template not found', 404)
    const repo = (await loadConfig()).repos.find((r) => r.id === b.repoId)
    if (!repo) throw new RepoError('Repo not found', 404)
    return planTemplate(t, repo.path)
  }

  /** Diff of applying a template to a repo. Existing files are kept; read-only. */
  app.post('/api/templates/preview', async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json(await previewFiles(await resolveTemplate((req.body ?? {}) as Record<string, unknown>)))
    } catch (e) {
      if (e instanceof AllowlistError) throw new RepoError(e.message, 422)
      throw e
    }
  })

  app.post('/api/templates/apply', async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>
    if (typeof b.token !== 'string') throw new RepoError('Body must include the preview token', 400)
    try {
      res.json(await applyFiles(await resolveTemplate(b), b.token))
    } catch (e) {
      if (e instanceof StaleTokenError) throw new RepoError(e.message, 409)
      if (e instanceof AllowlistError) throw new RepoError(e.message, 422)
      throw e
    }
  })

  app.get('/api/backup', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await backupStatus())
  })

  /** Explicit click only. Writes inside ~/.hangar/claude-backup, never to ~/.claude. */
  app.post('/api/backup/run', async (_req, res) => {
    try {
      res.json(await runBackup(opts.claudeHome ?? claudeHome()))
    } catch (e) {
      throw new RepoError(`Backup failed${e instanceof Error && 'code' in e && e.code === 'ENOENT' ? ': git is not installed or not on PATH' : ''}.`, 422)
    }
  })

  app.get('/api/dashboard', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await buildDashboard({ index: sessions, live, claudeHome: opts.claudeHome ?? claudeHome() }))
  })

  app.get('/api/insights/usage', async (req, res) => {
    await sessions.refresh()
    const config = await loadConfig()
    const days = Math.min(90, Math.max(1, Number.parseInt(String(req.query.days ?? '14'), 10) || 14))
    const usage = buildUsageInsights(sessions.usageInputs(config.repos), days)
    const budget = config.prefs.dailyBudgetUSD
    const todayCost = usage.days.find((d) => d.date === localDateKey(new Date()))?.cost ?? 0
    const body: UsageInsightsResponse = { ...usage, budget: { dailyBudgetUSD: budget, todayCost, over: budget !== null && todayCost > budget } }
    res.set('Cache-Control', 'no-store').json(body)
  })

  app.get('/api/insights/summary', async (_req, res) => {
    await sessions.refresh()
    const { repos } = await loadConfig()
    const windowDays = 14
    const since = Date.now() - windowDays * 24 * 60 * 60_000
    const recent = sessions
      .summaries()
      .filter((s) => s.lastEventAt && Date.parse(s.lastEventAt) >= since)
      .map((s) => withRepo(s, repos))

    const stuck = buildStuck(recent.map((s) => ({ id: s.id, repoName: s.repoName, failures: s.failures, ...(s.contextTokens !== undefined ? { contextTokens: s.contextTokens } : {}), ...(s.contextWindow ? { contextWindow: s.contextWindow } : {}) })))

    // Shipped: last 7 days. Registered repos get commits too; other sessions are listed by repo name.
    const weekAgo = Date.now() - 7 * 24 * 60 * 60_000
    const names = new Map<string, ShippedItem>()
    const entry = (repoName: string) => names.get(repoName) ?? names.set(repoName, { repoName, sessions: [], commits: [] }).get(repoName)!
    for (const s of recent) {
      if (s.lastEventAt && Date.parse(s.lastEventAt) >= weekAgo && s.titleSource !== 'none') entry(s.repoName).sessions.push(s.title)
    }
    await Promise.all(
      repos.map(async (r) => {
        const commits = await recentCommits(r.path, { sinceDays: 7, limit: 8 })
        if (commits.length > 0) entry(r.name).commits.push(...commits.map((c) => ({ commit: c.commit, subject: c.subject })))
      }),
    )
    const body: InsightsSummary = { windowDays, stuck, shipped: [...names.values()].filter((x) => x.sessions.length + x.commits.length > 0) }
    res.set('Cache-Control', 'no-store').json(body)
  })

  app.get('/api/prefs', async (_req, res) => {
    res.json((await loadConfig()).prefs)
  })

  app.put('/api/prefs', async (req, res) => {
    const patch = PrefsPatchSchema.safeParse(req.body)
    if (!patch.success) throw new RepoError('Body must be { "desktopAlerts"?: boolean }', 400)
    const config = await loadConfig()
    config.prefs = { ...config.prefs, ...patch.data }
    await saveConfig(config)
    res.json(config.prefs)
  })

  app.get('/api/live', async (_req, res) => {
    await live.poll()
    res.set('Cache-Control', 'no-store').json(live.snapshot())
  })

  /** Server-sent events: a full live snapshot on connect and after every change. */
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    send('live', live.snapshot())
    const onUpdate = (s: unknown) => send('live', s)
    const onTransition = (x: unknown) => send('transition', x)
    live.on('update', onUpdate)
    live.on('transition', onTransition)
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 20_000)
    req.on('close', () => {
      clearInterval(beat)
      live.off('update', onUpdate)
      live.off('transition', onTransition)
    })
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
      tasks: d.tasks,
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
