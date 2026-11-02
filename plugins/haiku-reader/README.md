# haiku-reader

Keeps large files out of the main model's context. When Claude tries to read a big file whole, the read is blocked and Claude is told to ask the `bulk-reader` subagent instead. That agent runs on Haiku, reads the files in its own context, and sends back only the answer to the question it was given.

## How it works

1. **A guard on `Read` and `Bash`.** Any read that would put 350 or more lines of a file into the context is denied, with a message naming the agent to use. That covers:
   - `Read` of the whole file, or of a slice that large (`limit: 5000`, or an `offset` with the rest of a long file after it)
   - `cat`, `nl`, `less`, `more` and `bat` on the file
   - `head` and `tail` whose count reaches the limit (`head -n 5000`, `tail -n +2`, `head -n -10`)
   - each part of a chain (`git status && cat big.ts`), following `cd` (`cd src && cat big.ts`)

   These still go through:
   - slices under the limit, and `head`/`tail` with small counts
   - images, PDFs and notebooks
   - missing files and directories, which the tool reports itself
   - output piped to another command (`cat big.ts | grep foo`) or redirected to a file (`cat big.ts > out.txt`)
   - paths the guard cannot know without running the command: `$VAR`, `$(...)`, or after `cd ~` or `cd "$DIR"`
   - `grep`, `sed`, `awk` and everything else
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
- The guard reads the shell commands people use to view files, not the whole shell grammar. `sed -n '1,999p'`, `awk`, scripts and anything behind a variable still go through.
