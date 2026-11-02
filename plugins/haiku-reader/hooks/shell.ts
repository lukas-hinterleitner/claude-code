// Works out which files a Bash command would print into the context, and how
// many of their lines. It reads the shell the way people actually write it for
// file viewing, not the whole grammar: anything it cannot be sure of (variables,
// command substitution, an unknown `cd` target) is left alone rather than guessed.

/** One file a command prints, and how many lines of it given its length. */
export type FileRead = {
  /** The program that prints it, as written (`cat`, `head`, ...). */
  program: string
  /** The path, relative to the working directory the command starts in, or absolute. */
  path: string
  /** Lines printed from a file of `total` lines (`Infinity` when the length is unknown). */
  printed: (total: number) => number
}

type Word = { text: string; isDynamic: boolean }
type Token = { word: Word } | { op: string }
type Redirect = { fd: number; op: string; target: Word }
type Stage = { words: Word[]; redirects: Redirect[] }

const WHOLE_FILE = new Set(['cat', 'nl', 'less', 'more', 'bat', 'batcat'])
const SEPARATORS = new Set(['&&', '||', ';', '&', '\n'])

const lex = (command: string): Token[] => {
  const tokens: Token[] = []
  let text = ''
  let isDynamic = false
  let hasWord = false
  const flush = () => {
    if (hasWord) tokens.push({ word: { text, isDynamic } })
    text = ''
    isDynamic = false
    hasWord = false
  }

  for (let i = 0; i < command.length; i++) {
    const c = command[i]!
    const rest = command.slice(i)

    if (c === '\\' && i + 1 < command.length) {
      if (command[i + 1] !== '\n') text += command[i + 1]
      hasWord = true
      i++
    } else if (c === "'") {
      const end = command.indexOf("'", i + 1)
      if (end < 0) return [] // unbalanced: give up on the whole command
      text += command.slice(i + 1, end)
      hasWord = true
      i = end
    } else if (c === '"') {
      let j = i + 1
      for (; j < command.length && command[j] !== '"'; j++) {
        if (command[j] === '\\') j++
        else if (command[j] === '$' || command[j] === '`') isDynamic = true
      }
      if (j >= command.length) return []
      text += command.slice(i + 1, j).replace(/\\(.)/g, '$1')
      hasWord = true
      i = j
    } else if (c === '$' || c === '`') {
      // Variables and substitutions: the word's value is unknown. Skip a
      // `$(...)` or backtick body whole so its own operators are not read.
      isDynamic = true
      hasWord = true
      if (rest.startsWith('$(')) {
        let depth = 0
        for (; i < command.length; i++) {
          if (command[i] === '(') depth++
          else if (command[i] === ')' && --depth === 0) break
        }
      } else if (c === '`') {
        const end = command.indexOf('`', i + 1)
        if (end < 0) return []
        i = end
      }
    } else if (c === ' ' || c === '\t') {
      flush()
    } else {
      const redirect = /^(\d*)(>>|>&|>|<|&>)/.exec(rest)
      const op = /^(&&|\|\||\||;|&|\n|\(|\))/.exec(rest)
      // A digit run is a redirect's fd only when it starts the word.
      if (redirect && (redirect[1] === '' || !hasWord)) {
        flush()
        tokens.push({ op: redirect[0] })
        i += redirect[0].length - 1
      } else if (op) {
        flush()
        tokens.push({ op: op[0] })
        i += op[0].length - 1
      } else {
        text += c
        hasWord = true
      }
    }
  }
  flush()
  return tokens
}

/** Splits into pipelines (separated by `&&`, `||`, `;`, `&`, newlines), each a list of stages. */
const parse = (tokens: Token[]): Stage[][] => {
  const pipelines: Stage[][] = []
  let pipeline: Stage[] = []
  let stage: Stage = { words: [], redirects: [] }
  const endStage = () => {
    if (stage.words.length > 0 || stage.redirects.length > 0) pipeline.push(stage)
    stage = { words: [], redirects: [] }
  }
  const endPipeline = () => {
    endStage()
    if (pipeline.length > 0) pipelines.push(pipeline)
    pipeline = []
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if ('word' in t) {
      stage.words.push(t.word)
    } else if (t.op === '|') {
      endStage()
    } else if (SEPARATORS.has(t.op) || t.op === '(' || t.op === ')') {
      endPipeline()
    } else {
      // A redirect: its target is the next word.
      const m = /^(\d*)(.*)$/.exec(t.op)!
      const target = tokens[i + 1]
      if (target === undefined || !('word' in target)) continue
      const op = m[2]!
      const fd = m[1] !== '' ? Number(m[1]) : op === '<' ? 0 : 1
      stage.redirects.push({ fd, op, target: target.word })
      i++
    }
  }
  endPipeline()
  return pipelines
}

const isAbsolute = (path: string) => path.startsWith('/')
const join = (dir: string, path: string) => (isAbsolute(path) || dir === '' ? path : `${dir.replace(/\/$/, '')}/${path}`)

/** Whether the stage's standard output goes somewhere other than the context. */
const isStdoutRedirected = (stage: Stage) =>
  stage.redirects.some(
    r =>
      (r.op === '&>' || ((r.op === '>' || r.op === '>>') && r.fd === 1)) &&
      r.target.text !== '/dev/stdout',
  )

/** `head`/`tail` line counts: `-n N`, `-nN`, `-N`, `--lines N`, `--lines=N`; `+N` from line N. */
const lineCount = (args: Word[], i: number): { value: string; used: number } | undefined => {
  const a = args[i]!.text
  if (a === '-n' || a === '--lines') return args[i + 1] && { value: args[i + 1]!.text, used: 2 }
  if (/^-n.+/.test(a)) return { value: a.slice(2), used: 1 }
  if (a.startsWith('--lines=')) return { value: a.slice('--lines='.length), used: 1 }
  if (/^-\d+$/.test(a)) return { value: a.slice(1), used: 1 }
  return undefined
}

const readsOf = (program: string, args: Word[]): { files: Word[]; printed: FileRead['printed'] } | undefined => {
  const files: Word[] = []
  let printed: FileRead['printed'] = total => total
  let isOptionsDone = false

  if (WHOLE_FILE.has(program)) {
    // `bat --line-range` prints a slice: targeted.
    if (program.startsWith('bat') && args.some(a => /^(-r|--line-range)/.test(a.text))) return undefined
    for (const arg of args) {
      if (!isOptionsDone && arg.text === '--') isOptionsDone = true
      else if (isOptionsDone || !arg.text.startsWith('-')) files.push(arg)
    }
    return { files, printed }
  }

  if (program === 'head' || program === 'tail') {
    let count = '10'
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!
      if (!isOptionsDone && arg.text === '--') {
        isOptionsDone = true
        continue
      }
      if (!isOptionsDone && arg.text.startsWith('-')) {
        if (/^(-c|--bytes|-f|-F|--follow)/.test(arg.text)) return undefined // bytes or a live follow
        const n = lineCount(args, i)
        if (n) {
          if (args[i + n.used - 1]!.isDynamic) return undefined
          count = n.value
          i += n.used - 1
        }
        continue
      }
      files.push(arg)
    }

    const fromLine = program === 'tail' && count.startsWith('+')
    const n = Number(count.replace(/^[+]/, ''))
    if (!Number.isFinite(n)) return undefined

    if (program === 'head') {
      // `head -n -K`: all but the last K lines.
      printed = n < 0 ? total => Math.max(total + n, 0) : total => Math.min(n, total)
    } else {
      printed = fromLine ? total => Math.max(total - n + 1, 0) : total => Math.min(Math.abs(n), total)
    }
    return { files, printed }
  }

  return undefined
}

/**
 * The files `command` would print whole or in large part, as far as it can be
 * told without running it. Pipelines with more than one stage are filters, and
 * output sent to a file never reaches the context: neither is listed.
 */
export const fileReads = (command: string): FileRead[] => {
  const out: FileRead[] = []
  let cwd = ''
  let isCwdKnown = true

  for (const pipeline of parse(lex(command))) {
    const stage = pipeline[0]!
    // Leading `NAME=value` assignments are not the program.
    const start = stage.words.findIndex(w => !/^[A-Za-z_]\w*=/.test(w.text))
    const words = start < 0 ? [] : stage.words.slice(start)
    const first = words[0]

    if (pipeline.length === 1 && first?.text === 'cd') {
      const dir = words[1]
      if (dir === undefined || dir.isDynamic || dir.text === '-' || dir.text.startsWith('~')) isCwdKnown = false
      else if (isAbsolute(dir.text)) {
        cwd = dir.text
        isCwdKnown = true
      } else cwd = join(cwd, dir.text)
      continue
    }

    if (pipeline.length > 1 || first === undefined || first.isDynamic || isStdoutRedirected(stage)) continue

    const program = first.text.split('/').pop()!
    const reads = readsOf(program, words.slice(1))
    if (reads === undefined) continue

    const input = stage.redirects.find(r => r.fd === 0 && r.op === '<')
    const files = reads.files.length === 0 && input ? [input.target] : reads.files

    for (const file of files) {
      if (file.isDynamic || file.text === '-' || file.text === '') continue
      if (!isAbsolute(file.text) && !isCwdKnown) continue
      out.push({ program, path: join(cwd, file.text), printed: reads.printed })
    }
  }

  return out
}
