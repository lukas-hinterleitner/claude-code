import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionUsage, TurnUsage } from 'claude-code'

import type { Snapshot, Tokens } from '../types'

// The id of the pane earlier versions opened; closed on load.
const OLD_PANE = 'usage-meter'
const BAR = 6
const NO_TOKENS: Tokens = { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

// Bump a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'usage-meter', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const tokens = atom({ plugin: 'usage-meter', key: 'tokens' } as const, NO_TOKENS, {
  shape: 'tokens-1',
})
const isHidden = atom({ plugin: 'usage-meter', key: 'isHidden' } as const, false)

const LIMIT_NAMES: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

const toSnapshot = (u: Omit<SessionUsage, 'startedAt'>, startedAt: number): Snapshot => ({
  startedAt,
  contextTokens: u.context.tokens,
  window: u.context.window,
  percent: u.context.percent,
  limits: u.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  usd: u.cost?.usd,
})

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`

const bar = (percent: number) => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * BAR)

  return '█'.repeat(filled) + '░'.repeat(BAR - filled)
}

const tone = (percent: number) => (percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success')

const untilReset = (resetsAt: string | undefined, now: number) => {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  return days > 0 ? ` (${days}d${hours}h)` : ` (${hours}h${minutes % 60}m)`
}

// One item of the meter: a label, an optional bar, and a tail.
type Item = { label: string; percent?: number; tail: string }

const itemText = (item: Item) =>
  item.percent !== undefined
    ? `${item.label} ${bar(item.percent)} ${item.percent}%${item.tail}`
    : `${item.label} ${item.tail}`.trimEnd()

const tally = async ($: EngineInterface, usage: TurnUsage) => {
  await update($, tokens, t => ({
    requests: t.requests + 1,
    input: t.input + usage.input_tokens,
    output: t.output + usage.output_tokens,
    cacheRead: t.cacheRead + usage.cache_read_input_tokens,
    cacheWrite: t.cacheWrite + usage.cache_creation_input_tokens,
    model: usage.model,
  }))
  // Cost and context between turns; session.measure only fires at a turn's end.
  const fresh = await $.session.usage()
  await update($, snapshot, () => toSnapshot(fresh, fresh.startedAt))
}

export const register: Register = (on, options) => {
  const placement = options.placement === 'below' ? 'below' : 'inline'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-meter', description: 'Show or hide the usage meter under the prompt' })
    await $.ui.close({ id: OLD_PANE })
    $.ui.status(undefined)

    const usage = await $.session.usage()
    const previous = await read($, snapshot)
    // A /clear starts the session's count over; a reload of this mod does not.
    if (previous?.startedAt !== usage.startedAt) await update($, tokens, () => NO_TOKENS)
    await update($, snapshot, () => toSnapshot(usage, usage.startedAt))

    return next(e)
  })

  on('command.run', { command: 'usage-meter' }, async $ => {
    const wasHidden = await read($, isHidden)
    await update($, isHidden, () => !wasHidden)

    return { text: wasHidden ? 'Usage meter shown.' : 'Usage meter hidden.' }
  })

  on('session.measure', async ($, e, next) => {
    const startedAt = (await read($, snapshot))?.startedAt ?? (await $.session.usage()).startedAt
    await update($, snapshot, () => toSnapshot(e, startedAt))

    return next(e)
  })

  // Every API request, main thread and subagents, as it completes.
  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const usage = response.usage
    if (usage) void tally($, usage)

    return response
  })

  // The hint line under the prompt. The engine draws its hint as a block of
  // its own, so nothing set beside it in a tree shares its row: `inline` rides
  // as the line's tail (drawn dim), `below` draws on the row under the hint.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const s = await read($, snapshot)
    if (s === null || (await read($, isHidden))) return next(e)

    const columns = e.viewport?.columns ?? 80
    const t = await read($, tokens)
    const now = await $.clock.now()

    const items: Item[] = [
      ...(s.percent !== undefined ? [{ label: 'ctx', percent: s.percent, tail: '' }] : []),
      ...s.limits.map(l => ({
        label: LIMIT_NAMES[l.kind] ?? l.kind,
        percent: l.percentUsed,
        tail: untilReset(l.resetsAt, now),
      })),
      ...(s.usd !== undefined ? [{ label: `$${s.usd.toFixed(2)}`, tail: '' }] : []),
      { label: 'in', tail: `${compact(t.input)} / out ${compact(t.output)}` },
      { label: `${t.requests}`, tail: 'req' },
    ]

    // Keep the leading items that fit the row; the tail ones go first.
    const room = placement === 'inline' ? columns - e.props.hint.length - 8 : columns - 4
    const shown: Item[] = []
    let used = 0
    for (const item of items) {
      const cost = itemText(item).length + 3
      if (used + cost > room) break
      shown.push(item)
      used += cost
    }

    if (shown.length === 0) return next(e)

    // The engine puts its own ` · ` between the hint and the tail.
    if (placement === 'inline') {
      return next({ ...e, props: { ...e.props, tail: shown.map(itemText).join(' · ') } })
    }

    const { Box, Text } = $.ui.resolve(e)
    const hint = await next(e)

    // The engine's node takes no sized Box above it, so the row stays a plain Box.
    return (
      <Box>
        {hint}
        {shown.map((item, i) => (
          <Box>
            {i > 0 && <Text dimColor> · </Text>}
            <Text dimColor>{item.label} </Text>
            {item.percent !== undefined && <Text color={tone(item.percent)}>{bar(item.percent)} </Text>}
            {item.percent !== undefined && <Text>{item.percent}%</Text>}
            {item.tail !== '' && <Text dimColor>{item.tail}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
