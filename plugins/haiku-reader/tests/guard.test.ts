import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

const FILES: Record<string, string> = {
  'big.ts': lines(400),
  'small.ts': lines(20),
  'edge.ts': lines(350),
  'below.ts': lines(349),
}

// The engine hands fs hooks resolved paths, so the fake looks files up by name.
const name = (path: string) => path.split('/').pop() ?? path

// Nothing sits beneath the plugin: each hook here stands for the engine,
// with an in-memory file system and a tool that always succeeds.
const engine = (on: Parameters<TestBody>[1]) => {
  on('fs.stat', (_, e) => {
    if (FILES[name(e.path)] === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return { value: { kind: 'file', size: FILES[name(e.path)]!.length, mtimeMs: 0, isLink: false } }
  })
  on('fs.read', (_, e) => {
    if (FILES[name(e.path)] === undefined) throw new Error('ENOENT')
    return { value: FILES[name(e.path)]! }
  })
  on('tool.call', () => ({ result: {} }))
}

const isDenied = (r: { deny?: string; isError?: boolean }) => r.deny !== undefined || r.isError === true

test('a whole read of a large file is denied and points at the bulk reader', async ($, on) => {
  engine(on)
  const r = await $.tool.call({ tool: 'Read', file_path: 'big.ts' })
  expect(isDenied(r)).toBe(true)
  expect(JSON.stringify(r)).toContain('haiku-reader:bulk-reader')
  expect(JSON.stringify(r)).toContain('400 lines')
})

test('small files, missing files and the line just under the limit are read', async ($, on) => {
  engine(on)
  for (const file_path of ['small.ts', 'below.ts', 'missing.ts']) {
    expect(isDenied(await $.tool.call({ tool: 'Read', file_path }))).toBe(false)
  }
  expect(isDenied(await $.tool.call({ tool: 'Read', file_path: 'edge.ts' }))).toBe(true)
})

test('a targeted read of a large file goes through', async ($, on) => {
  engine(on)
  expect(isDenied(await $.tool.call({ tool: 'Read', file_path: 'big.ts', offset: 100, limit: 50 }))).toBe(false)
})

test("a subagent's own read of a large file goes through", async ($, on) => {
  engine(on)
  expect(isDenied(await $.tool.call({ tool: 'Read', file_path: 'big.ts', agentId: 'a1' }))).toBe(false)
})

test('cat of a large file is denied; pipes, redirects and other commands are not', async ($, on) => {
  engine(on)
  expect(isDenied(await $.tool.call({ tool: 'Bash', command: 'cat big.ts' }))).toBe(true)
  expect(isDenied(await $.tool.call({ tool: 'Bash', command: 'cat -n small.ts "big.ts"' }))).toBe(true)

  for (const command of ['cat small.ts', 'cat big.ts | grep foo', 'cat big.ts > out.txt', 'head big.ts', 'git status']) {
    expect(isDenied(await $.tool.call({ tool: 'Bash', command }))).toBe(false)
  }
})

test('the line limit follows the setting', { options: { minLines: 10 } }, async ($, on) => {
  engine(on)
  expect(isDenied(await $.tool.call({ tool: 'Read', file_path: 'small.ts' }))).toBe(true)
})
