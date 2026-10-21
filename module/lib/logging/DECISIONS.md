# Architecture decisions: logging

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-15 — Secrets in call traces are marked with `@Sensitive`

- **Context:** `LoggingAspect` masked arguments only when the parameter name looked like a secret, so an authorization
  `code` or OAuth `state` reached DEBUG logs.
- **Decision:** a parameter carrying a secret is annotated `@Sensitive` and logged as `***`; the name regex stays as
  a safety net. Objects holding secrets override `toString` instead.
- **Consequences:** annotate on the method actually invoked through the proxy (the interface method for
  interface-based beans). Required by the repository `CLAUDE.md`.
- **Source:** commits `75c0d9d`, `6555d80`.

## 2026-10-16 — One trace line per call

- **Context:** `LoggingAspect` wrote a `call` and a `finish` line per method, and a facade → service → repository
  chain repeated one action six times; the logs had no timing.
- **Decision:** one DEBUG line when the call ends, holding `args`, `result` or `exception`, and `durationMs`. Values
  stay truncated to 500 characters; user content is not masked (pre-production debugging needs it).
- **Consequences:** nested calls are logged innermost first; a call that never returns leaves no line.
- **Source:** task `docs/tasks/2026-10-16-log-cleanup.md`.

## 2026-10-21 — `@Sensitive` follows the interface and masks results

- **Replaces:** the consequence "annotate on the method actually invoked through the proxy (the interface method for
  interface-based beans)" of the `@Sensitive` entry.
- **Context:** Spring proxies with CGLIB by default, so the invoked method is the class's; parameter annotations are
  not inherited, and an annotation on the interface method was silently ignored. Results were never masked, and the
  name regex missed OAuth `state`, codes and cookies.
- **Decision:** `LoggingAspect` reads parameter and method annotations through `AnnotatedMethod`, which also searches
  the interface methods. `@Sensitive` on a function masks its result. The fallback regex adds `credential`, `cookie`,
  `jwt`, `otp`, `state` and names ending in `code`. The unused `@MeasureTime` is removed.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 6.
