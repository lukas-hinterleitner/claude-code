# Claude Code plugins: usage meter and Haiku file reader

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace with two mods for the terminal:

- **usage-meter** shows context window fill, 5-hour and 7-day rate limits, session cost and token usage live under the prompt.
- **haiku-reader** saves tokens and context by sending large file reads to a Haiku subagent, which returns only the answer.

Install either one with `/plugin install <mod> --marketplace lukas-hinterleitner/claude-code`.

## Mods

| Mod | Version | What it does |
| --- | --- | --- |
| [usage-meter](plugins/usage-meter) | 0.3.0 | Live usage meter under the prompt: context fill, rate-limit windows, session cost and token totals |
| [haiku-reader](plugins/haiku-reader) | 0.1.1 | Hands large file reads to a Haiku subagent so the main model's context only gets the answer |

### usage-meter

```
▸▸ auto mode on (shift+tab to cycle) · ctx █░░░░░ 16% · 5h ██░░░░ 33% (3h32m) · 7d ██░░░░ 36% (2d7h) · $3.78 · in 90 / out 28.2k · 44 req
```

Every part can be toggled, and the meter can sit inline or on its own line with coloured bars. See the [usage-meter README](plugins/usage-meter/README.md) for settings.

### haiku-reader

When Claude goes to read a file of 350+ lines whole, the read is turned away and Claude asks the `bulk-reader` subagent instead. That agent runs on Haiku and returns only the answer. Targeted reads, small files and the subagent's own reads pass untouched. See the [haiku-reader README](plugins/haiku-reader/README.md).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install <mod> --marketplace lukas-hinterleitner/claude-code
```

Or from a shell:

```
claude plugin install <mod> --marketplace lukas-hinterleitner/claude-code
```

Answer `y` to add the marketplace, then pick a scope. To update later, run `/plugin update <mod>`.

## FAQ

### How do I see my Claude Code usage, rate limits and cost?

Install [usage-meter](plugins/usage-meter). It draws a meter on the hint line under the prompt with context window fill, how much of the 5-hour and 7-day rate-limit windows is used and when each resets, the session cost in US dollars, and input/output tokens per request, subagents included.

### How do I reduce Claude Code token usage when reading large files?

Install [haiku-reader](plugins/haiku-reader). Reads that would put 350 or more lines of a file into the context (via `Read`, `cat`, `head`, `tail` and similar) are turned away, and Claude asks the `haiku-reader:bulk-reader` subagent instead. That agent reads the file on the cheaper Haiku model and sends back only the answer, so the main model's context window stays small.

### Can I change the line limit?

Yes. The limit defaults to 350 and can be changed with `/config` or in `settings.json` under `pluginConfigs["haiku-reader"].options.minLines`.

### How do I add this plugin marketplace to Claude Code?

Run `/plugin install <mod> --marketplace lukas-hinterleitner/claude-code` and answer `y` when asked to add the marketplace. Update with `/plugin update <mod>`.

## Repository layout

```
.claude-plugin/marketplace.json   marketplace listing
plugins/<mod>/                    one directory per mod
  .claude-plugin/plugin.json      manifest and settings
  hooks/                          the mod's code
  tests/                          tests run by `claude plugin test`
  CHANGELOG.md                    release notes
```

## Contributing

Bug reports and ideas are welcome in [issues](https://github.com/lukas-hinterleitner/claude-code/issues). Before opening a pull request, run:

```
claude plugin validate plugins/<mod>
claude plugin test plugins/<mod>
```

## License

[MIT](LICENSE)
