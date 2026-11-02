import type { EngineInterface, Register } from 'claude-code'

const DEFAULT_MIN_LINES = 350
const MAX_BYTES = 4 * 1024 * 1024
const AGENT = 'haiku-reader:bulk-reader'

// Files the Read tool renders rather than dumping as text: leave them alone.
const NON_TEXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|ipynb)$/i

// Commands that print a whole file into the context.
const WHOLE_FILE_READERS = new Set(['cat', 'nl', 'less', 'more', 'bat', 'batcat'])

// Anything that pipes, redirects, chains or substitutes makes the command
// something other than a plain dump of a file, so it is let through.
const NOT_PLAIN = /[|<>;&`]|\$\(/

type Size = { lines: number } | { tooBig: true }

const measure = async ($: EngineInterface, path: string): Promise<Size | undefined> => {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat?.kind !== 'file') return undefined
  if (stat.size > MAX_BYTES) return { tooBig: true }

  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string' || text.includes('\0')) return undefined

  const lines = text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  return { lines }
}

const isLarge = (size: Size | undefined, minLines: number) =>
  size !== undefined && ('tooBig' in size || size.lines >= minLines)

const describe = (path: string, size: Size) =>
  'tooBig' in size ? `${path} is over 4 MiB` : `${path} has ${size.lines} lines`

const advice = (minLines: number) =>
  `Files of ${minLines}+ lines are not read whole here. ` +
  `Delegate instead: call the Agent tool with subagent_type "${AGENT}", ` +
  'passing the file paths and a specific question; it reads them with a smaller model and returns only the answer. ' +
  'If you need exact text from one region, Read it with offset and limit, or Grep for it.'

// Splits a simple command line into words, honouring single and double quotes.
const words = (command: string): string[] => {
  const out: string[] = []
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g
  for (const m of command.matchAll(re)) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

export const register: Register = (on, options) => {
  const configured = Number(options.minLines)
  const minLines = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_LINES

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    // Subagents (the bulk reader among them) read freely; so does a targeted read.
    if (e.agentId !== undefined) return next(e)
    if (e.offset !== undefined || e.limit !== undefined) return next(e)
    if (NON_TEXT.test(e.file_path)) return next(e)

    const size = await measure($, e.file_path)
    if (size === undefined || !isLarge(size, minLines)) return next(e)

    return { deny: `${$.plugin.name}: ${describe(e.file_path, size)}. ${advice(minLines)}` }
  }).catch(($, e, next) => next(e)) // a guard that fails lets the call through

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    const command = e.command.trim()
    if (NOT_PLAIN.test(command)) return next(e)

    const [program, ...args] = words(command)
    if (program === undefined || !WHOLE_FILE_READERS.has(program)) return next(e)

    const files = args.filter(arg => !arg.startsWith('-'))
    for (const file of files) {
      const size = await measure($, file)
      if (size !== undefined && isLarge(size, minLines)) {
        return { deny: `${$.plugin.name}: ${describe(file, size)}. ${advice(minLines)}` }
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))
}
