# CLAUDE.md — `:security`

Guide to `module/lib/security` (`io.uliss.security`). Cross-cutting rules (workflow, conventions,
closed decisions) are in the root `CLAUDE.md` — read it first. This file covers architecture
specific to this library. The auth server as the other half of the same OAuth flow is in
`module/auth/CLAUDE.md`.

## Role

`:security` plays **two roles at once** for every dependent service (`user-service` and future
ones):

1. **OAuth2 Resource Server** — validates JWTs via `jwk-set-uri` (`${AUTH_INTERNAL_URL}/oauth2/jwks`,
   the path of the real auth server — see "Two different `/oauth2`" below).
2. **Auth mediator** for the frontend.

`SecurityConfig` is **STATELESS** (the service does not store tokens), `/oauth2/**` and
`/*/oauth2/**` are `permitAll`, everything else is `authenticated` (two patterns: the bare one —
for `:security`'s own tests without an app prefix, and the one with a single wildcard segment —
for the mediator under a consuming app's prefix, see "Path-prefix convention" in the root
`CLAUDE.md`). `/actuator/health` is also `permitAll` here (bare, never behind
`WebMvcPathPrefixConfig` — management endpoints aren't `@RestController`s) — this is what lets
`user`/`note` expose it for docker-compose healthchecks without their own `SecurityConfig` (`auth`
has no dependency on `:security` and opens it up in its own config instead, see the "monitoring"
entry in the root `CLAUDE.md`). `:security` also configures CORS.

**Two different `/oauth2`:** the library class `AuthController` is declared as
`@RequestMapping("/oauth2")` and is tested in `:security` in that form (`AuthMediatorTest`), but
externally (for the browser) it is served under the prefix of the app that includes it — in
`user-service` that's `/user/oauth2/**` (`WebMvcPathPrefixConfig` in `user-app`, see root
`CLAUDE.md`). Below, paths in this file are described as the browser sees them
(`/user/oauth2/*`). Separate from this are the paths of the **real Authorization Server**
(`module/auth`, its own host `auth.uliss.local`): `/oauth2/authorize`, `/oauth2/token`,
`/oauth2/revoke`, `/oauth2/jwks` — these belong to Spring Authorization Server, are unrelated to
the mediator's prefix, and do not change.

**`AuthController` (`/oauth2/**` inside the library, `/user/oauth2/**` externally in
`user-service`) + `AuthService`** — a thin OAuth client that carries out the whole dance on
behalf of the frontend:

- `GET /user/oauth2/login` — `AuthService` generates a PKCE `code_verifier`, puts it in a
  **cookie** `code_verifier` (secure per `AUTH_SECURE_COOKIE`), 302 → `${AUTH_PUBLIC_URL}/oauth2/authorize`
  (browser-facing URL of the real AS; token/revoke below go to `AUTH_INTERNAL_URL` — see
  "Split-horizon auth URL").
- `POST /user/oauth2/callback?code` (+ cookie `code_verifier`) — exchanges the code for tokens at
  AS `/oauth2/token` (confidential: `client_id`+`client_secret`+`code_verifier`), returns
  `TokenResponse` as **JSON**.
- `POST /user/oauth2/refresh` `{refreshToken}` — refresh grant against the AS, returns new tokens.
- `POST /user/oauth2/logout` `{refreshToken}` — revocation at AS `/oauth2/revoke` (best-effort).
- All calls to the AS go through `RestClient` with `@Retryable` (retries on AS unavailability).

**Full flow:** browser → service `GET /user/oauth2/login` → AS `/oauth2/authorize` → login → AS →
SPA `/callback?code` → SPA `POST` to service `/user/oauth2/callback` (cookie `code_verifier`
travels same-origin) → JSON tokens. The AS redirects to `${FRONTEND_URL}/callback` (the SPA), not
to this service.

## Split-horizon auth URL (public vs internal)

The AS address is split into **two** variables because, behind an ingress/gateway, the browser
and the pod reach the AS via different paths (this is a property of the topology, not just k8s —
the same trick as Keycloak's `KC_HOSTNAME`):

- **`AUTH_PUBLIC_URL`** — browser-facing: the 302 redirect to `/oauth2/authorize`
  (`AuthService.createLoginRedirectUrl`) + the auth server issuer (`app.auth.issuer`). In k8s =
  `http://auth.uliss.local` (via ingress).
- **`AUTH_INTERNAL_URL`** — service-to-service: exchanging code/refresh at `/oauth2/token`,
  `/oauth2/revoke` (`AuthService`), and the resource server's `jwk-set-uri`. In k8s =
  `http://auth:9000` (the service's cluster DNS).

In `:security` these are the fields `authServerPublicUrl` / `authServerInternalUrl`
(`SecurityProperties`); in yml — `security.oauth2.client.auth-server-public-url` /
`-internal-url`. Locally/in Compose both are equal (`http://auth.uliss.local:9000`) — the split
"collapses". The resource server does **not** validate the issuer (only `jwk-set-uri`), so the
only hard requirement is that `AUTH_INTERNAL_URL` must be reachable from the pod, and
`AUTH_PUBLIC_URL` from the browser.

## SPA token strategy (decision)

The React SPA (`module/web`) **does not talk to the auth server directly and does not even know
its address.** It only talks to **its own current service** (`/user/oauth2/*` from `:security`),
and the service (confidential client + PKCE) drives the OAuth redirects and hands back tokens as
JSON. This is a deliberate choice — recorded here so it isn't reopened (decision history is in
prior discussion; in short: the server does **not** store tokens, because a stateless lib-per-service
cannot centrally store state without a shared store/gateway, which doesn't exist yet; so the
browser holds the tokens).

- **Storage:** both tokens (access + refresh) live in the browser, in `sessionStorage`
  (`auth/tokenStore.ts` in `module/web`, cleared when the tab closes). The service is stateless
  and stores nothing.
- **Refresh:** `authFetch` (`auth/apiClient.ts` in `module/web`) refreshes **proactively** (based
  on `expiresAt` with an `EXPIRY_SKEW_MS` margin) and **reactively** (on `401` /
  `opaqueredirect` from the entry point) — it sends `refreshToken` to `/user/oauth2/refresh`.
  A failed refresh triggers `login()` (full-page redirect to `/user/oauth2/login`).
- **Why a mediator service rather than direct SPA→AS:** it hides the AS from the frontend,
  centralizes OAuth in `:security`, and lets the OAuth client be confidential (the secret stays
  server-side). This does **not** reduce the XSS risk compared to the direct-SPA model — the
  refresh token still sits in JS-accessible `sessionStorage`. The mediator's value is
  encapsulation, not token protection.
- **Backlog (NOT doing now):** **BFF** — the server holds the refresh token, and the browser gets
  only an HttpOnly cookie (eliminates XSS token theft). Requires a **shared point** (a gateway or
  a shared store like Redis), since a stateless lib across N services can't hold the refresh
  centrally. Until then, the known trade-off is refresh in `sessionStorage` (mitigated by
  rotation + a short access TTL). The `access_token` (JWT) is already valid across all services
  without any shared cache — they are stateless validators (shared AS + JWKS).

See also `module/auth/CLAUDE.md` — the other half of this same OAuth flow (two
`SecurityFilterChain`s, client seeding, `UserService`/JWK, token enrichment, registration, Auth
UI), and `module/web/CLAUDE.md` — how the SPA uses this mediator.
