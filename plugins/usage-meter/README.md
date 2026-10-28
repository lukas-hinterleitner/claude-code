# usage-meter

A live usage meter for Claude Code, drawn on the hint line under the prompt.
It shows how full the context window is, how much of your 5-hour and 7-day
rate-limit windows you have used (with the time until each resets), what the
session has cost so far, and the input and output tokens of every API request
in the session, subagents included. The figures update after each request,
not only at the end of a turn.

```
▸▸ auto mode on (shift+tab to cycle) · ctx █░░░░░ 16% · 5h ██░░░░ 33% (3h32m) · 7d ██░░░░ 36% (2d7h) · $3.78 · in 90 / out 28.2k · 44 req
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-meter --marketplace lukas-hinterleitner/claude-code
```

From a shell:

```
claude plugin install usage-meter --marketplace lukas-hinterleitner/claude-code
```

Answer `y` to add the marketplace, then pick a scope.

## Settings

Set them in `/config` or with `/plugin configure usage-meter@lukas-hinterleitner`; the meter reloads with the new values.

| Setting          | Values            | Default  | What it does                                                                 |
| ---------------- | ----------------- | -------- | ---------------------------------------------------------------------------- |
| `placement`      | `inline`, `below` | `inline` | `inline`: after the hint, on the same line, dim. `below`: on its own line under the hint, with green, yellow and red bars. |
| `showContext`    | `true`, `false`   | `true`   | Context window fill                                                          |
| `showFiveHour`   | `true`, `false`   | `true`   | 5-hour rate-limit window                                                     |
| `showSevenDay`   | `true`, `false`   | `true`   | 7-day rate-limit window                                                      |
| `showResetTimes` | `true`, `false`   | `true`   | Time until each rate-limit window resets                                     |
| `showCost`       | `true`, `false`   | `true`   | Session cost in US dollars                                                   |
| `showTokens`     | `true`, `false`   | `true`   | Input and output tokens                                                      |
| `showRequests`   | `true`, `false`   | `true`   | Number of API requests                                                       |

## Use

- `/usage-meter` shows or hides the meter.
- Bars turn yellow at 70% and red at 90% (with `placement: below`).
- When the line is too narrow, items drop from the right, the request count first.
- After `/clear` the token counts start over.

## Develop

```
claude --plugin-dir plugins/usage-meter
claude plugin validate plugins/usage-meter
claude plugin test plugins/usage-meter
```

## License

MIT
