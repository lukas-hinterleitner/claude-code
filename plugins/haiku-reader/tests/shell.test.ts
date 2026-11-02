import { expect, test } from 'claude-code/testing'
import { fileReads } from '../hooks/shell'

// What each command would print of a 1000-line file, per file it names.
const plan = (command: string) =>
  fileReads(command).map(r => ({ program: r.program, path: r.path, printed: r.printed(1000) }))

test('whole-file readers print everything', () => {
  expect(plan('cat a.ts')).toEqual([{ program: 'cat', path: 'a.ts', printed: 1000 }])
  expect(plan('cat -n a.ts "b c.ts"')).toEqual([
    { program: 'cat', path: 'a.ts', printed: 1000 },
    { program: 'cat', path: 'b c.ts', printed: 1000 },
  ])
  expect(plan('/bin/cat -- -odd.ts')).toEqual([{ program: 'cat', path: '-odd.ts', printed: 1000 }])
  expect(plan('cat < a.ts')).toEqual([{ program: 'cat', path: 'a.ts', printed: 1000 }])
  expect(plan('LC_ALL=C nl a.ts')).toEqual([{ program: 'nl', path: 'a.ts', printed: 1000 }])
  expect(plan('bat --line-range 1:20 a.ts')).toEqual([])
})

test('head and tail print what their count says', () => {
  expect(plan('head a.ts')[0]?.printed).toBe(10)
  expect(plan('head -n 500 a.ts')[0]?.printed).toBe(500)
  expect(plan('head -n500 a.ts')[0]?.printed).toBe(500)
  expect(plan('head -500 a.ts')[0]?.printed).toBe(500)
  expect(plan('head --lines=500 a.ts')[0]?.printed).toBe(500)
  expect(plan('head -n 5000 a.ts')[0]?.printed).toBe(1000)
  expect(plan('head -n -100 a.ts')[0]?.printed).toBe(900)
  expect(plan('tail -n 400 a.ts')[0]?.printed).toBe(400)
  expect(plan('tail -n +101 a.ts')[0]?.printed).toBe(900)
  expect(plan('tail -c 100 a.ts')).toEqual([])
  expect(plan('tail -f a.log')).toEqual([])
})

test('chains are read part by part, following cd', () => {
  expect(plan('cd src && cat a.ts')).toEqual([{ program: 'cat', path: 'src/a.ts', printed: 1000 }])
  expect(plan('cd /repo; cd lib && head -n 400 a.ts')).toEqual([
    { program: 'head', path: '/repo/lib/a.ts', printed: 400 },
  ])
  expect(plan('git status && cat a.ts || echo no')).toEqual([{ program: 'cat', path: 'a.ts', printed: 1000 }])
  expect(plan('cat a.ts 2>/dev/null')).toEqual([{ program: 'cat', path: 'a.ts', printed: 1000 }])
})

test('what cannot reach the context, or cannot be known, is left alone', () => {
  expect(plan('cat a.ts | grep foo')).toEqual([])
  expect(plan('cat a.ts > out.txt')).toEqual([])
  expect(plan('cat a.ts &> out.txt')).toEqual([])
  expect(plan('cat $FILE')).toEqual([])
  expect(plan('cat "$(ls | head -1)"')).toEqual([])
  expect(plan('cd ~/x && cat a.ts')).toEqual([])
  expect(plan('cd "$DIR" && cat a.ts')).toEqual([])
  expect(plan('cd ~/x && cat /abs/a.ts')).toEqual([{ program: 'cat', path: '/abs/a.ts', printed: 1000 }])
  expect(plan("echo 'cat a.ts'")).toEqual([])
  expect(plan('cat \'unbalanced')).toEqual([])
  expect(plan('grep -n foo a.ts')).toEqual([])
})
