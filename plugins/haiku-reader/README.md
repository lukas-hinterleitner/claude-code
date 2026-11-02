# haiku-reader

Keeps large files out of the main model's context. When Claude tries to read a big file whole, the read is blocked and Claude is told to ask the `bulk-reader` subagent instead. That agent runs on Haiku, reads the files in its own context, and sends back only the answer to the question it was given.

## How it works

1. **A guard on `Read` and `Bash`.** A whole-file read of a file with 350 or more lines is denied, with a message naming the agent to use. These still go through:
   - reads with `offset` or `limit`
   - images, PDFs and notebooks
   - missing files and directories, which the tool reports itself
   - `cat`, `nl`, `less`, `more` or `bat` piped, redirected or chained into anything else (`cat big.ts | grep foo`)
   - `head`, `tail`, `grep` and everything else
   - every read made inside a subagent, so the bulk reader itself is never blocked
2. **The `haiku-reader:bulk-reader` agent.** It runs on the `haiku` model with only `Read`, `Grep` and `Glob`, and answers in terse bullets led by the exact symbol or `path:line`.

If the guard itself fails, the call goes through rather than blocking work.

## Install

```
/plugin install haiku-reader --marketplace lukas-hinterleitner/claude-code
```

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `minLines` | `350` | Whole-file reads of files with at least this many lines go to the bulk reader. |

Change it with `/config`, or in `settings.json` under `pluginConfigs["haiku-reader"].options.minLines`.

## Trade-offs

- Haiku's answer is a summary. When the exact text of a region matters, Claude can still read it with `offset` and `limit`, or with `Grep`.
- Each delegation starts a subagent, which has a fixed cost. The line limit keeps small files out of that path.
- Files over 4 MiB are always sent to the bulk reader, since the guard does not count their lines.
