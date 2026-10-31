# Claude Code mods

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [Claude Code](https://docs.claude.com/en/docs/claude-code) plugin marketplace with small mods that change the terminal interface.

## Mods

| Mod | Version | What it does |
| --- | --- | --- |
| [usage-meter](plugins/usage-meter) | 0.3.0 | Live usage meter under the prompt: context fill, rate-limit windows, session cost and token totals |

### usage-meter

```
▸▸ auto mode on (shift+tab to cycle) · ctx █░░░░░ 16% · 5h ██░░░░ 33% (3h32m) · 7d ██░░░░ 36% (2d7h) · $3.78 · in 90 / out 28.2k · 44 req
```

Every part can be toggled, and the meter can sit inline or on its own line with coloured bars. See the [usage-meter README](plugins/usage-meter/README.md) for settings.

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
