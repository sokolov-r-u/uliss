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
