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

## 2026-10-21 — Refresh grants have an absolute limit, check the user and detect reuse

- **Context:** rotation gave every refresh a fresh 30-day token, so an active session (or a stolen refresh token)
  never ended; a disabled user kept refreshing; a stolen token used first silently pushed the real user out.
- **Decision:** `RefreshGrantPolicy` runs in the token customizer for refresh grants and rejects with
  `invalid_grant` when the user is missing or `DISABLED`, or when the sign-in (issue time of the authorization code,
  which stays in the authorization) is older than 90 days. `ReuseDetectingAuthorizationService` wraps the JDBC
  authorization service, remembers SHA-256 hashes of rotated-out refresh tokens (`auth.rotated_refresh_token`, removed
  with the authorization) and removes the whole authorization when one of them is presented again.
- **Consequences:** the inactivity window stays 30 days, but a password is needed at least every 90 days. A
  duplicated browser tab shares one copied refresh token, so the second tab's refresh now ends the session of both
  tabs instead of only its own (`docs/TECH_DEBT.md`, "Session drops").
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 3.

## 2026-10-21 — Only configured clients exist; the m2m client is removed

- **Replaces:** the consequence "Clients missing from config are not touched yet" of "Registered clients are rebuilt
  from config on startup" (2026-10-15).
- **Context:** the `uliss-internal` client-credentials client was registered and its secret handed to user- and
  note-service, but nothing used it: REST refuses tokens without `userId`, gRPC accepts only the service token auth
  signs itself. A renamed or removed client kept working with its old secret.
- **Decision:** the m2m client and its `APP_CLIENTS_M2M_*` settings are removed. At startup `DataInitializer` deletes
  every registered client config does not have, with its authorizations and consents (`RetiredClientRepository`).
  The signing key is created under an advisory lock, so replicas starting on an empty database agree on one key.
  Lookups by token value and state use hash indexes; `client_id` is unique.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 4.

## 2026-10-31 — A just-rotated refresh token serves one retry; concurrent rotations compare-and-set

- **Replaces:** in part, "Refresh grants have an absolute limit, check the user and detect reuse" (2026-10-21): a
  rotated-out token presented again no longer always revokes.
- **Context:** the `:security` mediator gives up on auth after 5 s, but auth still finished the refresh and rotated
  the token. The browser kept the old token, its next refresh was taken for theft, and the session was revoked. Any
  answer lost on the way (timeout, network, closed tab) has the same effect.
- **Decision:** `ReuseDetectingAuthorizationService` accepts a refresh with the token the last rotation of the
  authorization replaced, within 30 seconds of that rotation (`rotated_at`, now written from `Clock`): it returns the
  authorization and Spring issues a new pair. Older or earlier tokens, and revocation with any rotated token, still
  revoke. An authorization loaded by refresh token carries its stored refresh token in an in-memory attribute;
  `save` locks the row, saves only if that token is still stored, and otherwise throws `ConcurrentRefreshException`
  (503 `temporarily_unavailable`, which the mediator retries). The attribute is removed before saving.
- **Consequences:** a thief holding a token rotated less than 30 seconds ago gets one pair without revoking the
  session. The user-service gRPC call stays outside any transaction; the row lock lasts only for the save.
- **Source:** task `docs/tasks/2026-10-31-refresh-timeout-session-loss.md`, block 2.
