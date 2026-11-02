# Changelog

## 0.1.0

- First release: a `bulk-reader` subagent on Haiku, and a guard that turns any read that would put a large file into the context into a pointer to that agent.
- The guard covers whole-file and large-slice `Read` calls, and in `Bash`: `cat`, `nl`, `less`, `more`, `bat`, and `head`/`tail` with large counts, in every part of a chain and after `cd`. Piped and redirected output is let through.
- `minLines` setting: the line count at which the guard steps in (default 350).
