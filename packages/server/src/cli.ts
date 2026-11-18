import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createApp } from './app.js'

const HOST = '127.0.0.1' // never configurable: Hangar is local-only
const DEFAULT_PORT = 4777

const here = dirname(fileURLToPath(import.meta.url))

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function findWebDir(): string | undefined {
  // Published: dist/cli.js + dist/web. Dev (tsx): src/cli.ts, web built into ../dist/web.
  return [join(here, 'web'), join(here, '..', 'dist', 'web')].find((d) => existsSync(join(d, 'index.html')))
}

const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
    'no-open': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log('Usage: hangar [--port <n>] [--no-open]\n\nLocal dashboard for Claude Code. Binds to 127.0.0.1 only.')
  process.exit(0)
}

const requested = values.port ? Number(values.port) : DEFAULT_PORT
if (!Number.isInteger(requested) || requested < 1 || requested > 65535) {
  console.error(`Invalid port: ${values.port}`)
  process.exit(1)
}

const app = createApp({ version: readVersion(), webDir: findWebDir(), startLive: true })

function listen(port: number, attemptsLeft: number): void {
  const server = app.listen(port, HOST)
  server.once('listening', async () => {
    const url = `http://localhost:${port}`
    console.log(`Hangar running at ${url}`)
    if (!values['no-open']) {
      const { default: open } = await import('open')
      await open(url).catch(() => undefined)
    }
  })
  server.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0 && !values.port) {
      listen(port + 1, attemptsLeft - 1)
      return
    }
    console.error(err.code === 'EADDRINUSE' ? `Port ${port} is in use.` : `Failed to start: ${err.message}`)
    process.exit(1)
  })
}

listen(requested, 10)
