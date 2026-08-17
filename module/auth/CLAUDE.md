# CLAUDE.md — `auth`

Guide to `module/auth` (`io.uliss.auth`) — OAuth2 Authorization Server. Cross-cutting rules
(workflow, conventions, closed decisions) — in the root `CLAUDE.md`, read it first. The other
half of the same OAuth flow (resource server + auth mediator for the rest of the services) —
`module/lib/security/CLAUDE.md`.

## Auth server

Runtime authentication setup (requires reading several files in `module/auth` and `:security`):

- `auth` — OAuth2 Authorization Server with **two** `SecurityFilterChain`s (`SecurityConfig`):
  `@Order(1)` matches `/oauth2/**` + `/.well-known/**` (OIDC endpoints, redirects to `/login` on
  an HTML request); `@Order(2)` — everything else. On the second chain: custom
  `formLogin.loginPage("/login")` (disables Spring's default login-page generator → `GET /login`
  reaches `AuthController`), `permitAll` for `/login`, `/register`, `/ds/**`, `/error`, and
  **eager CSRF token loading** (`CsrfTokenRequestAttributeHandler.setCsrfRequestAttributeName(null)`)
  — otherwise on large pages with inline SVG the response commits before the form renders and lazy
  CSRF doesn't get to create the session in time.
- **Clients** are stored in the DB (`JdbcRegisteredClientRepository`, tables from
  `V3__ddl_create_spring_auth_tables.sql`) and seeded on startup in `DataInitializer`:
  `uliss-web` — a **confidential** client (`CLIENT_SECRET_BASIC`), grants `authorization_code` +
  `refresh_token`, PKCE required (`requireProofKey`, defense-in-depth), scopes `openid profile`,
  redirects to **all** addresses from `AUTH_CLIENT_CALLBACK_URLS` (CSV → multiple `redirectUri`,
  so one client works both locally and in k8s); TTL — access 15 min, refresh 30 days,
  **rotation** (`reuseRefreshTokens=false` → each refresh issues a new refresh token, the old one
  is invalidated). `DataInitializer` **upserts**: if the client already exists in the DB, missing
  redirect URIs are appended on startup (no need to wipe the DB when switching environments).
  `uliss-internal` — m2m, `client_secret_basic`, grant `client_credentials`, scope `internal`.
  Important: the client is **not** public — it's used by a **service** (`:security`), not the
  browser (see "SPA token strategy" in `module/lib/security/CLAUDE.md`), so the `REFRESH_TOKEN`
  grant is intentionally enabled.
- **User authentication**: `UserService` implements `UserDetailsService` (lookup by email,
  table `auth.users`), passwords — `BCryptPasswordEncoder(strength=12)`. `UserEntity.status` —
  `@Enumerated(EnumType.STRING)` (otherwise ordinal would violate the CHECK constraint). JWK keys
  are persisted in the DB (`SigningKeyEntity` / `SigningKeysService`), exposed via
  `/.well-known/jwks.json`.
  **The token `sub` = `auth.users.id` (UUID), not email** — login is still by email
  (`loadUserByUsername(email)`), but `toUserDetails().username(id.toString())` makes the identity
  name a stable UUID (an OIDC-correct subject: email can change/be reassigned, UUID does not; and
  it doesn't leak PII in every token). Email is added as a separate claim when needed, not in `sub`.
- **Access-token enrichment** (`TokenConfig.tokenCustomizer`): the user token gets claims `roles`,
  `userId` (the profile id in user-service), and `displayName` (if set). `userId`/`displayName`
  are fetched via a synchronous gRPC call `UserService.getUserInfo(authId = sub)` to user-service,
  which **lazily creates the profile on first login** (find-or-create) and seeds onboarding
  messages. User-service unavailability → `OAuth2AuthenticationException` (**login is blocked** —
  a token without `userId` is incomplete; a deliberate trade-off: auth's availability is tied to
  user-service). For `client_credentials` (m2m) this block is skipped — a service token has no user.
    - **gRPC transport (port `USER_GRPC_PORT`, separate from HTTP `USER_SERVER_PORT`):** the
      auth-side client is `GrpcConfig` (`ManagedChannel`, `usePlaintext`, host `USER_SERVICE_HOST` /
      port `USER_GRPC_PORT`, **no defaults** → fail-fast). In k8s `USER_SERVICE_HOST=user` (secret
      patch), the `user` Service exposes both the `http` and `grpc` ports.
      `spring-boot-starter-grpc-server`, when Spring Security is on the classpath,
      **auto-secures** gRPC as an OAuth2 resource server (requires a Bearer token); since gRPC is
      cluster-internal (not routed through ingress) and the client doesn't send a token,
      user-service opens it up with `permitAll` via `GrpcSecurityConfig` (its own
      `AuthenticationProcessInterceptor` → the auto-config backs off via `@ConditionalOnMissingBean`).
      HTTP security is unaffected. Hardening (mTLS/m2m) is backlog.
- **Registration — server-side form only** (`AuthController`, `GET`/`POST /register`, DTO
  `RegisterUserRequest(email, password)`); on success → `redirect:/login?registered`. The REST
  endpoint `/auth/register` was removed intentionally: with Authorization Code + PKCE,
  registration is hosted on the auth server, and the password never reaches the SPA. `displayName`
  is **not stored** in auth — it lives in `user-service`.
- **Auth UI** (`AuthController` + Thymeleaf, see below): `/login` and `/register` serve a single
  page with both forms and client-side tab switching (without a reload).

## Auth UI (Thymeleaf)

Server-rendered login/registration pages (Phase B of the plan is done). Design:

- **One template, both forms.** `GET /login` and `GET /register` (`AuthController`) render the
  fragment `templates/fragments/layout.html :: page(active)`, where **both** forms (sign-in and
  register) are present in the DOM. The `active` parameter (`signin`/`register`) sets the active
  tab; switching happens **client-side** (vanilla JS, tab buttons with `data-tab`,
  `history.replaceState` changes the URL without a reload). `login.html`/`register.html` are thin
  wrappers over the fragment.
- **The forms are real:** sign-in `POST /login` (Spring formLogin, `username`/`password` fields),
  register `POST /register` (`th:object="${registerForm}"`, `email`/`password` fields). The
  `registerForm` object is put into the model explicitly on both GET handlers (not via an
  `@ModelAttribute` method — otherwise it breaks constructor-binding of the immutable DTO on
  POST). SSO / "email sign-in link" / "forgot" are visually present but inactive (the backend
  doesn't support them).
- **Tab markup is identical** (buttons align at the same height): both forms use
  `.auth-body{min-height:404px}` + a `.spacer{flex:1}` spacer; register reserves invisible space
  for the "Forgot passphrase" line from sign-in.
- **Design system:** DS CSS tokens are loaded via `<link th:href="@{/ds/styles.css}">`; the visuals
  (Wordmark gradient, fields, buttons, the Orion constellation) live in the fragment's inline
  `<style>` on top of the tokens. Orion is a static SVG fragment
  (`templates/fragments/orion.html`), its geometry ported from the Claude Design `uliss-auth.jsx`.
  The design source is the Claude Design project, pulled via the MCP `DesignSync`. General design
  system layout — `module/lib/uliss-design-system/CLAUDE.md`.
- **Anti-cache:** `WebConfig` sets `Cache-Control: no-store` on `/login` and `/register`
  (`HandlerInterceptor`); `spring.thymeleaf.cache: false` (dev). Hash-fingerprinting `/ds/**` is
  Phase C's concern (Vite).

See also `module/lib/security/CLAUDE.md` — the resource server + auth mediator used by the other
services, split-horizon auth URL, SPA token strategy.
