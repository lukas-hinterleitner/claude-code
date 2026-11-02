# Changelog

## 0.1.0

- First release: a `bulk-reader` subagent on Haiku, and a guard that turns whole-file `Read`, `cat`, `nl`, `less`, `more` and `bat` calls on large files into a pointer to that agent.
- `minLines` setting: the line count at which the guard steps in (default 350).
