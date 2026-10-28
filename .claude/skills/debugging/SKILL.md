---
name: debugging
description: Use when a test fails, a build breaks, or the app behaves unexpectedly — before proposing any fix. Root cause first, then a regression test, then one fix.
---

# Systematic debugging in uliss

Adapted from Superpowers `systematic-debugging` (github.com/obra/superpowers, MIT).

**No fix without a root cause.** A fix that makes the symptom go away without explaining it is a guess.

## 1. Investigate

- Read the whole error: stack trace, Gradle "What went wrong", the failing assertion, the test report
  (`module/<m>/build/reports/tests/<task>/index.html`, XML under `build/test-results/`).
- Reproduce with the narrowest command (`./gradlew :<module>:test --tests '<Class>.<method>'`). Not reproducible →
  gather more data; do not guess.
- Check what changed: `git diff`, `git log -p` on the touched files, dependency bumps in
  `gradle/libs.versions.toml`, Testcontainers images, `docs/TROUBLESHOOTING.md` for known issues.
- Across service boundaries (web → nginx → auth/user/note, REST ↔ gRPC, outbox → consumer, DB), find **where**
  the data first goes wrong: log or assert what enters and leaves each boundary, run once, then look only at the
  failing layer.
- Trace a bad value back to where it originates and fix it there, not where it surfaces.

## 2. Compare

- Find similar code in the repo that works and list every difference, however small.
- When following a library pattern, read the reference fully (context7 for library docs).

## 3. Hypothesize

- State one hypothesis: "X is the cause because Y". Test it with the smallest change, one variable at a time.
- Wrong → form a new hypothesis; do not stack fixes. Say "I don't understand X" when that is the case.

## 4. Fix

- Write a regression test that reproduces the bug and fails for the right reason (see the `tdd` skill), then make
  one fix for the root cause. No "while I'm here" changes. Exception: in `module/web` fix first and add the tests
  after the user confirms the result in the UI (`module/web/CLAUDE.md`).
- Re-run the failing test and the module's tests; report the command and its output.
- **Three failed fixes → stop.** Each fix revealing a new problem elsewhere points at the design, not the code.
  Describe what you found to the user and discuss the options before a fourth attempt.

## Truly external causes

If the cause is environmental or timing-dependent (Docker, Testcontainers start-up, network), record what was
checked, handle it explicitly (Awaitility condition, timeout, clear error), and add it to
`docs/TROUBLESHOOTING.md` when it may recur. Most "no root cause" findings are an unfinished investigation.
