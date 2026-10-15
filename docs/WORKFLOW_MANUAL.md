# Manual mode

Manual mode is a stricter, step-by-step workflow. It is off by default.

- Enter: the user says "ручной режим". Exit: the user says "обычный режим". It lasts until exited or until the session
  ends; a new session always starts in the default mode.
- Every rule of the default workflow in the root `CLAUDE.md` still applies unless this file overrides it.

## Overrides

- No commits at all: no `git commit`, `push`, `revert`, `reset`, `rebase`, `tag`, or `merge`. Read-only Git and
  staging are allowed. The user makes every commit.
- Change at most 5 unique version-controlled files in one autonomous batch. New files count; repeated edits to the same
  file do not. Documentation (`*.md`), the ignored task journal, and generated build/cache files do not count.
- After changing and checking the fifth file, stop with a diff and verification summary for user review. Start a new
  count after approval. Tasks changing at most 5 files need no routine checkpoint.
- Changes the user asks for while reviewing a batch are not limited by file count.
- Stop after each logical code step (code, its tests, test run, task-file update) and wait for an explicit go-ahead,
  even when the whole plan was approved beforehand and regardless of the permission mode.
- Anything that executes project behavior beyond tests and read-only build/compile tasks requires per-request
  permission.
