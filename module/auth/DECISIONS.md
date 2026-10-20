# Architecture decisions: auth

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-14 — Authorizations and consents are persisted

- **Decision:** `JdbcOAuth2AuthorizationService` and `JdbcOAuth2AuthorizationConsentService` replace the in-memory
  defaults, so sessions survive restarts and work across replicas. `AuthorizationCleanupService` deletes
  authorizations whose every code and token has expired (daily cron).
- **Source:** commits `e39eef3` (persistence), `bf0c269` (cleanup).

## 2026-10-15 — Registered clients are rebuilt from config on startup

- **Context:** `RegisteredClient.from(existing)` kept grant types, scopes and auth methods added outside config.
- **Decision:** each configured client is rebuilt entirely from config, keeping only `id` and `clientIdIssuedAt`
  (stored authorizations reference the id). The stored secret hash is reused only while it matches and its encoding is
  current; a client already in sync is not rewritten.
- **Consequences:** anything added to a client row by hand is removed at the next start. Clients missing from config
  are not touched yet (`docs/TECH_DEBT.md`).
- **Source:** commits `749a322`, `637d282`.

## 2026-10-17 — A login without a saved request goes to the web app

- **Context:** a login whose session held no saved `/oauth2/authorize` request (form opened directly, restored or
  resubmitted) was redirected to this server's `/`, which has no handler and answered 404 problem+json.
- **Decision:** the form-login chain uses `defaultSuccessUrl(app.frontend-url, alwaysUse = false)`: a saved request
  still wins; otherwise the browser goes to the web app, whose own login passes on the now signed-in session.
- **Source:** task `docs/tasks/2026-10-17-auth-login-glitches.md`, block 3.

## 2026-10-21 — The token endpoint answers 503 while user-service is unavailable

- **Context:** the token customizer failed with a plain OAuth2 error, which Spring Authorization Server answers with
  400. The `:security` mediator reads any 400 on refresh as a rejected grant, so a user-service outage signed out
  every user whose access token expired meanwhile.
- **Decision:** the customizer throws `UserServiceUnavailableException` (`temporarily_unavailable`), and the token
  endpoint's `TokenErrorResponseHandler` answers it with 503; every other error keeps the default 400. No token is
  issued (fail-closed stays). The token is generated before the authorization is saved, so the code or refresh token
  is still valid and a retry succeeds. The mediator passes the 503 through after its retries.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 1.
