# Architecture decisions: cross-module

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-15 — Decision logs live next to the code

- **Context:** most decisions are now made during autonomous work and were only kept in gitignored task files.
- **Decision:** every module keeps its own `DECISIONS.md`; decisions spanning several modules go here.
- **Consequences:** a decision is committed together with the code that implements it.
- **Source:** `docs/tasks/2026-10-15-review-fixes.md`.

## 2026-10-15 — DEBUG call tracing is a pre-production tool

- **Context:** `LoggingAspect` logs every service/repository call with arguments and results at DEBUG, and the example
  environment sets `LOG_LEVEL_ULISS=debug`.
- **Decision:** keep it while the project is pre-production; mask secrets with `@Sensitive` (see
  `module/lib/logging/DECISIONS.md`). User prompts and other user content must not be logged in production — logging
  is reworked before the move (`docs/TECH_DEBT.md`, "Rework logging before production").
- **Consequences:** logs and Dozzle currently contain user content; not acceptable for production.
- **Source:** `docs/tasks/2026-10-15-review-fixes.md`.
