# Architecture decisions: user-service

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-21 — Only a pending onboarding step can be submitted

- **Context:** a double submit hit the optimistic lock and answered 500; a skipped or completed step could be
  submitted again and silently edited the profile while its status stayed.
- **Decision:** `submit` locks the user's step row (`PESSIMISTIC_WRITE`) before applying the command. A step that is
  not `PENDING` (or was never seeded for the user) answers 409 `ONBOARDING_STEP_NOT_PENDING`; a catalog code without
  a row is a server error. Commands take `OnboardingInput`, not the transport DTO. gRPC answers `UNAVAILABLE` for a
  database outage and accepts only the service token whose `sub` is `UserServiceAuth.SUBJECT`.
- **Consequences:** editing the profile later needs its own endpoint.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 8.
