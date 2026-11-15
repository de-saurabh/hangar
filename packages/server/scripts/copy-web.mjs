// Copies the built web app into the server's dist so the published package is self-contained.
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '..', '..', 'web', 'dist')
const to = join(here, '..', 'dist', 'web')

if (!existsSync(from)) {
  console.error('web build not found at', from, '- run `pnpm build` from the repo root.')
  process.exit(1)
}
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
console.log('copied web build ->', to)
