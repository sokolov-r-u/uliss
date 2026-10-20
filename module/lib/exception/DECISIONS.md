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
