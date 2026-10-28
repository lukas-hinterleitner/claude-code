export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Snapshot = {
  startedAt: number
  contextTokens?: number
  window: number
  percent?: number
  limits: Limit[]
  usd?: number
}

export type Tokens = {
  requests: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  model?: string
}

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { snapshot: Shaped<Snapshot | null>; tokens: Shaped<Tokens>; isHidden: boolean }
  }
}
