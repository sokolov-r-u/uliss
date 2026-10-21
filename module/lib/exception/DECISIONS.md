# Architecture decisions: exception

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-21 — One error format, conflicts are 409, client errors log no user content

- **Context:** binding errors were logged at INFO with `rejected value [...]` (a whole prompt), optimistic-lock and
  integrity errors answered 500, standard MVC errors (unreadable body, 405, 415) answered `ProblemDetail`, and our own
  4xx without explicit details reached the client as a bare code.
- **Decision:** `GlobalExceptionHandler` logs a 4xx at INFO with field names and constraint codes only; the full
  message goes to DEBUG (removed with the rest of user content, `docs/TECH_DEBT.md` "Rework logging").
  `OptimisticLockingFailureException` → 409 `VERSION_CONFLICT`, `DataIntegrityViolationException` → 409 `CONFLICT`,
  both without the database message. `handleExceptionInternal` turns every standard MVC error into `ErrorResponse`
  (404 → `NOT_FOUND_ERROR`, other 4xx → `BAD_REQUEST_ERROR`; an unreadable body never echoes the input). A 4xx
  `ServerException` without details returns its message in `details.message`. The library no longer depends on JPA.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 5.

## 2026-10-21 — Only a constraint race is a 409

- **Replaces:** "`DataIntegrityViolationException` → 409 `CONFLICT`" of "One error format, conflicts are 409, client
  errors log no user content" (2026-10-21).
- **Context:** every integrity violation answered 409 and was logged at INFO without a stack trace, so a not null,
  length or check violation (missing validation) looked to the client like a race to reload, and nobody saw the bug.
- **Decision:** a violation whose SQL state is 23505 (unique) or 23503 (foreign key) is a race and answers 409
  `CONFLICT`; any other answers 500 and is logged as a server error. The database message stays out of the response.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, code review round.
