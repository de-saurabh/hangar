import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { discover, TranscriptTail } from '../src/sources/transcripts.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hangar-tr-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const line = (o: unknown) => JSON.stringify(o) + '\n'

function tailOf(path: string) {
  const got: unknown[] = []
  let resets = 0
  const tail = new TranscriptTail(path, (l) => got.push(l), () => { got.length = 0; resets++ })
  return { tail, got, resets: () => resets }
}

describe('TranscriptTail', () => {
  it('reads all lines first, then only the new ones', async () => {
    const f = join(dir, 's.jsonl')
    await writeFile(f, line({ n: 1 }) + line({ n: 2 }))
    const { tail, got } = tailOf(f)
    expect(await tail.advance()).toMatchObject({ lines: 2, reset: false })
    await appendFile(f, line({ n: 3 }))
    expect(await tail.advance()).toMatchObject({ lines: 1 })
    expect(got).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
    expect(await tail.advance()).toMatchObject({ lines: 0 })
  })

  it('leaves a half-written last line until it is complete', async () => {
    const f = join(dir, 's.jsonl')
    await writeFile(f, line({ n: 1 }) + '{"n":2,"par')
    const { tail, got } = tailOf(f)
    expect((await tail.advance()).lines).toBe(1)
    await appendFile(f, 'tial":true}\n')
    expect((await tail.advance()).lines).toBe(1)
    expect(got).toEqual([{ n: 1 }, { n: 2, partial: true }])
  })

  it('consumes a final unterminated line only when it is complete JSON', async () => {
    const f = join(dir, 's.jsonl')
    await writeFile(f, line({ n: 1 }) + '{"n":2}') // no trailing newline
    const { tail, got } = tailOf(f)
    expect((await tail.advance()).lines).toBe(2)
    expect(got).toEqual([{ n: 1 }, { n: 2 }])
    await appendFile(f, '\n') // the newline arrives later: nothing new, nothing duplicated
    expect((await tail.advance()).lines).toBe(0)
  })

  it('skips invalid lines and counts them without stopping', async () => {
    const f = join(dir, 's.jsonl')
    await writeFile(f, line({ n: 1 }) + 'not json\n' + '\n' + line({ n: 2 }))
    const { tail, got } = tailOf(f)
    expect(await tail.advance()).toMatchObject({ lines: 2, badLines: 1 })
    expect(got).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('resets and re-reads from the start when the file shrinks', async () => {
    const f = join(dir, 's.jsonl')
    await writeFile(f, line({ n: 1 }) + line({ n: 2 }) + line({ n: 3 }))
    const { tail, got, resets } = tailOf(f)
    await tail.advance()
    await writeFile(f, line({ n: 9 }))
    expect(await tail.advance()).toMatchObject({ reset: true, lines: 1 })
    expect(resets()).toBe(1)
    expect(got).toEqual([{ n: 9 }])
  })

  it('handles multi-byte characters across the boundary of reads', async () => {
    const f = join(dir, 's.jsonl')
    await writeFile(f, line({ t: 'héllo → 日本語 🚀' }))
    const { tail, got } = tailOf(f)
    await tail.advance()
    expect(got).toEqual([{ t: 'héllo → 日本語 🚀' }])
  })

  it('reads a file larger than one chunk without losing or duplicating lines', async () => {
    const f = join(dir, 'big.jsonl')
    const filler = 'x'.repeat(2000)
    const count = 3000 // about 6 MB, more than the 4 MB chunk
    let text = ''
    for (let i = 0; i < count; i++) text += line({ i, filler })
    await writeFile(f, text)
    const { tail, got } = tailOf(f)
    expect((await tail.advance()).lines).toBe(count)
    expect(got).toHaveLength(count)
    expect((got[count - 1] as { i: number }).i).toBe(count - 1)
  })

  it('reports a missing file as an error for the caller to handle', async () => {
    const { tail } = tailOf(join(dir, 'nope.jsonl'))
    await expect(tail.advance()).rejects.toThrow()
  })
})

describe('discover', () => {
  it('lists top-level transcripts only, skipping subdirectories and other files', async () => {
    const proj = join(dir, 'projects', 'C--code-demo')
    await mkdir(join(proj, 'abc', 'subagents'), { recursive: true })
    await writeFile(join(proj, 'abc.jsonl'), line({ a: 1 }))
    await writeFile(join(proj, 'abc', 'subagents', 'agent-1.jsonl'), line({ a: 1 }))
    await writeFile(join(proj, 'notes.txt'), 'x')
    const found = await discover(dir)
    expect(found.map((f) => [f.sessionId, f.projectDir])).toEqual([['abc', 'C--code-demo']])
    expect(found[0]?.size).toBeGreaterThan(0)
  })

  it('returns an empty list when there is no projects directory', async () => {
    expect(await discover(join(dir, 'nowhere'))).toEqual([])
  })
})
