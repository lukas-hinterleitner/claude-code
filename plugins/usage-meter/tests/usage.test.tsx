import type { SessionMeasureInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const HINT = (columns: number) =>
  ({
    plugin: 'usage-meter',
    component: 'PromptHint',
    viewport: { columns, rows: 50 },
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  }) as const

const USAGE = {
  startedAt: 1000,
  context: { tokens: 50_000, window: 200_000, percent: 25 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 92 }],
  cost: { usd: 1.5 },
}

// Nothing sits beneath the plugin: each hook here stands for the engine.
const engine = (on: Parameters<TestBody>[1]) => {
  on('command.register', () => ({ value: { command: 'usage-meter' } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('session.usage', () => ({ value: USAGE }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: 0 }))
  // The engine's own hint line: the hint, then the tail a hook set.
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{`${e.props.hint}${e.props.tail ?? ''}`}</Text>
  })
}

const MEASURE: SessionMeasureInput = {
  context: { tokens: 120_000, window: 200_000, percent: 60 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 92 }],
  cost: { usd: 2.25 },
  changed: ['context', 'cost'],
}

test("the meter rides after the engine's hint, as its tail", async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(MEASURE)

  const wide = await $.ui.mount({ ...HINT(160), surface: 'terminal' })
  expect((await wide.find({ type: 'Text' }))?.text).toBe(
    '? for shortcuts' + 'ctx ████░░ 60% · 5h ██████ 92% · $2.25 · in 0 / out 0 · 0 req',
  )
  await wide.unmount()

  // A narrow row keeps the leading items and drops the tail ones.
  const narrow = await $.ui.mount({ ...HINT(45), surface: 'terminal' })
  expect((await narrow.find({ type: 'Text' }))?.text).toBe('? for shortcuts' + 'ctx ████░░ 60%')
  await narrow.unmount()

  // /usage-meter hides the meter, leaving the engine's hint.
  await $.command.run({
    command: 'usage-meter',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
  const hidden = await $.ui.mount({ ...HINT(160), surface: 'terminal' })
  expect((await hidden.find({ type: 'Text' }))?.text).toBe('? for shortcuts')
  await hidden.unmount()
})

test('placement below draws the meter under the hint, its bars coloured', { options: { placement: 'below' } }, async ($, on) => {
  engine(on)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure(MEASURE)

  const ui = await $.ui.mount({ ...HINT(160), surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /shortcuts/ }))?.text).toBe('? for shortcuts')
  expect((await ui.find({ type: 'Text', text: /█/ }))?.props.color).toBe('success')
  expect((await ui.find({ type: 'Text', text: /\$/ }))?.text).toBe('$2.25 ')
  await ui.unmount()
})

test(
  'parts set to false are left out',
  { options: { showFiveHour: false, showResetTimes: false, showTokens: false, showRequests: false } },
  async ($, on) => {
    engine(on)

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.session.measure(MEASURE)

    const ui = await $.ui.mount({ ...HINT(160), surface: 'terminal' })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('? for shortcuts' + 'ctx ████░░ 60% · $2.25')
    await ui.unmount()
  },
)
