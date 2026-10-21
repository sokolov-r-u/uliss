# Architecture decisions: security

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-14 — OAuth `state` binds the callback to the browser

- **Decision:** login sets an HttpOnly `oauth_state` cookie next to `code_verifier`; the callback compares it with
  the `state` parameter in constant time and clears both one-time cookies.
- **Source:** commit `683a25d`.

## 2026-10-15 — An incomplete callback is a rejected login, not a binding error

- **Context:** a missing cookie or parameter failed in Spring binding (raw 400) before the cookie cleanup ran; a blank
  `state` matched itself.
- **Decision:** callback parameters and cookies are optional and validated in the service: missing or blank code,
  state, verifier or state cookie → 400 `AUTHORIZATION_CODE_ERROR`. Login cookies are cleared only when the request
  carried one, so a cross-site POST cannot wipe a login in progress.
- **Source:** commits `9ff64fe`, `353cba2`.

## 2026-10-15 — Refresh failures: which ones end the session

- **Context:** the token endpoint answers a refresh with 400/401 only; other 4xx come from a busy server or a proxy.
- **Decision:** 400 and 401 (`invalid_client` is also logged as an error) → 401 `INVALID_REFRESH_TOKEN`, the SPA
  signs in again. 408/429 → retried 3 times, then 503. Other 4xx → 500. 503 and 500 keep the SPA's tokens.
- **Consequences:** a rate-limiting proxy no longer logs everyone out; a misconfigured mediator client still does
  (login then fails visibly at the callback).
- **Source:** commits `9ff64fe`, `9fe4851`.

## 2026-10-14 — One-time grants are retried only before the request is sent

- **Decision:** code exchange and refresh retry 5xx and connect failures only; a read timeout or reset after sending is
  not retried, because the server may have consumed the code or rotated the token. Logout is idempotent and retries
  both.
- **Source:** commit `761d055`.

## 2026-10-17 — Login cookies live 30 minutes

- **Context:** `code_verifier` and `oauth_state` lived 300 s; a login form left open longer failed at the callback
  with 400 although the auth-server session was still valid.
- **Decision:** both cookies live 1800 s, the default auth-server session timeout; they stay single-use and are
  cleared by the callback.
- **Source:** task `docs/tasks/2026-10-17-auth-login-glitches.md`, block 2.

## 2026-10-21 — The key set is fetched with the auth server timeouts

- **Context:** Spring Security fetches the JWKS with Nimbus's default 500 ms read timeout. A cold or busy auth server
  (and a loaded CI runner, where `JwtValidationTest` failed) answered more slowly, and a valid token was rejected.
- **Decision:** a `JwkSetUriJwtDecoderBuilderCustomizer` (`JwkSetClientConfig`) gives the key set client the timeouts
  of every other call to the auth server: 3 s to connect, 5 s to read. Boot's validators stay as configured.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, CI failure after the code review round.
