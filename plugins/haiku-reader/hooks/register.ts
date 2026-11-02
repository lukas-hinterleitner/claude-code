import type { EngineInterface, Register } from 'claude-code'
import { fileReads } from './shell'

const DEFAULT_MIN_LINES = 350
const MAX_BYTES = 4 * 1024 * 1024
const AGENT = 'haiku-reader:bulk-reader'

// The Read tool's own cap on lines returned when no limit is given.
const READ_DEFAULT_LIMIT = 2000

// Files the Read tool renders rather than dumping as text: leave them alone.
const NON_TEXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg|pdf|ipynb)$/i

/** A file's line count; `Infinity` when it is too big to count here. */
const lineCount = async ($: EngineInterface, path: string): Promise<number | undefined> => {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat?.kind !== 'file') return undefined
  if (stat.size > MAX_BYTES) return Infinity

  const text = await $.fs.read(path).catch(() => undefined)
  if (typeof text !== 'string' || text.includes('\0')) return undefined

  return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

const size = (total: number) => (total === Infinity ? 'over 4 MiB' : `${total} lines`)

const advice = (minLines: number) =>
  `Reads of ${minLines}+ lines are not made here. ` +
  `Delegate instead: call the Agent tool with subagent_type "${AGENT}", ` +
  'passing the file paths and a specific question; it reads them with a smaller model and returns only the answer. ' +
  `If you need exact text from one region, Read it with offset and a limit under ${minLines}, or Grep for it.`

export const register: Register = (on, options) => {
  const configured = Number(options.minLines)
  const minLines = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MIN_LINES

  const deny = (name: string, what: string) => ({ deny: `${name}: ${what}. ${advice(minLines)}` })

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    // Subagents (the bulk reader among them) read freely.
    if (e.agentId !== undefined || NON_TEXT.test(e.file_path)) return next(e)
    // A small slice is fine without knowing the file's length.
    if (e.limit !== undefined && e.limit < minLines) return next(e)

    const total = await lineCount($, e.file_path)
    if (total === undefined) return next(e)

    const from = Math.max(e.offset ?? 1, 1)
    const printed = Math.min(e.limit ?? READ_DEFAULT_LIMIT, Math.max(total - from + 1, 0))
    if (printed < minLines) return next(e)

    const isWhole = e.offset === undefined && e.limit === undefined
    return deny(
      $.plugin.name,
      isWhole
        ? `${e.file_path} is ${size(total)}`
        : `this Read would return ${printed === Infinity ? 'too many' : printed} lines of ${e.file_path} (${size(total)})`,
    )
  }).catch(($, e, next) => next(e)) // a guard that fails lets the call through

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)

    for (const read of fileReads(e.command)) {
      const total = await lineCount($, read.path)
      if (total === undefined) continue

      const printed = read.printed(total)
      if (printed >= minLines) {
        return deny(
          $.plugin.name,
          `${read.program} would print ${printed === Infinity ? 'all' : printed} lines of ${read.path} (${size(total)})`,
        )
      }
    }

    return next(e)
  }).catch(($, e, next) => next(e))
}
