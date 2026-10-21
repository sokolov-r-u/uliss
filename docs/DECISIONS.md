# Architecture decisions: cross-module

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-15 — Decision logs live next to the code

- **Context:** most decisions are now made during autonomous work and were only kept in gitignored task files.
- **Decision:** every module keeps its own `DECISIONS.md`; decisions spanning several modules go here.
- **Consequences:** a decision is committed together with the code that implements it.
- **Source:** `docs/tasks/2026-10-15-review-fixes.md`.

## 2026-10-15 — DEBUG call tracing is a pre-production tool

- **Context:** `LoggingAspect` logs every service/repository call with arguments and results at DEBUG, and the example
  environment sets `LOG_LEVEL_ULISS=debug`.
- **Decision:** keep it while the project is pre-production; mask secrets with `@Sensitive` (see
  `module/lib/logging/DECISIONS.md`). User prompts and other user content must not be logged in production — logging
  is reworked before the move (`docs/TECH_DEBT.md`, "Rework logging before production").
- **Consequences:** logs and Dozzle currently contain user content; not acceptable for production.
- **Source:** `docs/tasks/2026-10-15-review-fixes.md`.

## 2026-10-16 — Service path prefix comes from a property

- **Context:** user and note each kept an identical `WebMvcPathPrefixConfig` differing only in the prefix string.
- **Decision:** one `WebMvcPathPrefixConfig` in `:security`, enabled by `uliss.web.path-prefix`; each service sets the
  property in its `application.yaml`. Replaces the per-service copies.
- **Consequences:** a `@WebMvcTest` imports `WebMvcPathPrefixConfig` explicitly and needs the property in its test
  `application.yaml`; a service without the property gets no prefix.
- **Source:** `docs/tasks/2026-10-16-code-quality-cleanup.md`.

## 2026-10-16 — `:security` reads `SYSTEM_AUDITOR` from `:database` at compile time only

- **Context:** the "no user" auditor value was declared in both `:database` and `:security` to avoid a dependency.
- **Decision:** the constant lives only in `:database`; `:security` uses `compileOnly(project(":database"))`. Kotlin
  inlines `const val`, so `:security` has no runtime dependency on `:database` and its tests start without JPA.
- **Consequences:** only `const val` declarations of `:database` may be used from `:security`; anything else fails at
  runtime in a service without `:database`.
- **Source:** `docs/tasks/2026-10-16-code-quality-cleanup.md`.

## 2026-10-16 — gRPC calls to user-service carry a service token signed by auth

- **Context:** user-service gRPC permitted every call, so anyone reaching port 9090 could resolve any auth id to a
  profile id and display name (review item №6).
- **Decision:** auth signs a short-lived JWT with its own signing key for each user-service call (`sub=auth-service`,
  `aud=user-service`, `scope=user.info`, 5 minutes, cached), without calling its own token endpoint. user-service
  validates it on gRPC with a dedicated decoder (JWKS, `iss`, `aud`) and requires `SCOPE_user.info`. A reserved
  all-zero `userId` was rejected: the token would pass the REST resource server, and user tokens would pass gRPC.
  The contract constants live in `UserServiceAuth` in `user-api`. Compose publishes 9090 and 5432 on loopback only.
- **Consequences:** auth and user-service must be deployed together; user-service needs the auth JWKS reachable for
  gRPC as well. No TLS yet.
- **Source:** `docs/tasks/2026-10-16-review-remaining-fixes.md`.


## 2026-10-16 — Services refuse users until blocking onboarding is done

- **Context:** only the SPA enforced blocking onboarding steps; when loading the steps failed it let the user in, and
  no service checked that a display name was set (review item №23). More mandatory steps may follow.
- **Decision:** user-service reports `onboarding_required` (any pending blocking message) in `GetUserInfo`; auth adds
  the access-token claim `onboardingRequired: true` only while it is true. `:security` registers
  `OnboardingGuardInterceptor`, which answers `403 ONBOARDING_REQUIRED` for every handler not marked
  `@AllowedDuringOnboarding` (the mediator `AuthController` and user-service onboarding endpoints are). The SPA keeps
  onboarding blocking when the steps fail to load, force-refreshes the session after the last blocking step, and starts
  onboarding again on `403 ONBOARDING_REQUIRED` (refreshing a stale token when nothing blocking is left).
- **Consequences:** the claim lags behind the database until the next refresh, so the SPA refresh after the last
  blocking step is part of the contract. A new endpoint that must work during onboarding needs the annotation. A new
  blocking step needs SPA support, or users of an older SPA are refused until they reload.
- **Source:** `docs/tasks/2026-10-16-review-remaining-fixes.md`.

## 2026-10-18 — Home deployment serves uliss.home over HTTPS from a local CA

- **Context:** dictation needs a secure context; the compose stack served only `http://uliss.home`, so the microphone
  was unavailable on phones and tablets over the VPN.
- **Decision:** the compose `web` nginx terminates TLS for `uliss.home` with a certificate issued by a local `mkcert`
  root CA (`infra/tls/generate-certs.sh`, files in gitignored `infra/volumes/tls`, mounted read-only — never in the
  image or git). `:80` and any other Host redirect to `https://uliss.home`; no HSTS. Compose overrides
  `FRONTEND_URL`, the auth callback and `AUTH_SECURE_COOKIE` for HTTPS; `infra/.env` and host-based `bootRun` stay on
  HTTP. `auth` stays on `http://auth.uliss.home:9000` (reached only by navigation, so no mixed content). Devices trust
  the CA root once; renewals need nothing on them.
- **Consequences:** the `web` image no longer serves plain HTTP and needs the mounted certificate, so the minikube
  path would have to provide it too (not the deployment target). HTTPS for `auth` and an edge proxy remain in
  `docs/TECH_DEBT.md` / ROADMAP item 11.
- **Source:** `docs/tasks/2026-10-18-home-https.md`.

## 2026-10-18 — auth.uliss.home is served over HTTPS through the web nginx

- **Replaces:** the "`auth` stays on `http://auth.uliss.home:9000`" part of "Home deployment serves uliss.home over
  HTTPS from a local CA" (2026-10-18).
- **Decision:** the compose `web` nginx also terminates TLS for `auth.uliss.home` (same mkcert certificate, extra SAN)
  and proxies to `auth:9000`, overwriting `X-Forwarded-Proto/Host/Port` and clearing `Forwarded`/`X-Forwarded-Prefix`.
  `auth` uses `server.forward-headers-strategy: framework` (testable with MockMvc) and sets its session cookie Secure
  from `AUTH_SECURE_COOKIE`, because the forwarded-header filter does not reach Tomcat's session cookie. Compose sets
  `AUTH_PUBLIC_URL=https://auth.uliss.home` and `AUTH_INTERNAL_URL=http://auth:9000`, drops the `auth.uliss.home`
  network alias and publishes `:9000` on loopback only.
- **Consequences:** `auth` trusts forwarded headers from any client that reaches it directly, so `:9000` must stay
  unreachable from other machines. The issuer changes, so tokens issued under the old one are rejected until refreshed.
  The VPN tunnel and ufw no longer need `:9000`.
- **Source:** `docs/tasks/2026-10-18-home-https.md`.

## 2026-10-18 — The web image serves HTTP by default; compose opts into TLS

- **Replaces:** the consequence "the `web` image no longer serves plain HTTP" of "Home deployment serves uliss.home
  over HTTPS from a local CA" (2026-10-18).
- **Context:** the minikube example mounts no certificate and routes the Ingress to `web:80`, so a TLS-only image
  failed to start there.
- **Decision:** the image ships two nginx template sets — `module/web/nginx/http` (default, `/etc/nginx/templates`)
  and `module/web/nginx/tls` (`/etc/nginx/templates-tls`) — sharing `module/web/nginx/uliss-app.conf`. Compose selects
  TLS with the nginx image's `NGINX_ENVSUBST_TEMPLATE_DIR`; under k8s TLS would belong to the Ingress.
- **Consequences:** SPA and `/user`/`/note` routing changes go into `uliss-app.conf` once; host-level changes (redirects,
  auth proxy) may need both variants.
- **Source:** `docs/tasks/2026-10-18-home-https.md`.

## 2026-10-21 — Signing out ends the auth server session through OIDC end-session

- **Context:** sign-out only revoked the refresh token. The auth server's browser session lived on, so the SPA's
  automatic login right after sign-out got a new code without a password.
- **Decision:** the mediator requests `scope=openid profile` and passes the `id_token` through. `POST /oauth2/logout`
  takes `{refreshToken, idToken}`, revokes, and answers `{redirectUrl}` — the auth server's `/connect/logout` with
  `id_token_hint`, `client_id` and `post_logout_redirect_uri` (`FRONTEND_URL/signed-out`, registered on the web client
  from `AUTH_CLIENT_POST_LOGOUT_URLS`). The SPA keeps the `id_token` with its tokens, navigates the whole page there,
  and lands on a "signed out" page that does not start a login by itself. The auth server's first chain now matches
  `endpointsMatcher`, so `/userinfo` and `/connect/logout` work.
- **Consequences:** the logout response changes from 204 to 200 with a body. A session started before this change has
  no `id_token`, so its sign-out falls back to revocation only.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 2.

## 2026-10-21 — Resource servers require the web client audience

- **Context:** user and note services checked only `iss` and a `userId` claim; any token of the same issuer with a
  `userId` (an id token, a future service token) would have been accepted.
- **Decision:** `security.yml` sets `spring.security.oauth2.resourceserver.jwt.audiences` to `FRONTEND_CLIENT_ID`;
  auth issues user access tokens with `aud` = the web client id.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 4.

## 2026-10-21 — Signing out in one tab signs out the whole browser

- **Context:** every tab keeps its own tokens in `sessionStorage`. A tab that signed in silently through the auth
  server session has its own authorization, which end-session left alone (Spring Authorization Server only ends the
  HTTP session), so it kept refreshing for up to 90 days; a duplicated tab kept its copied access token for 15 minutes.
- **Decision:** auth remembers the ID token's `sid` of every authorization (`SessionTrackingAuthorizationService`,
  `auth.authorization_session`, V8) and its end-session handler removes all authorizations of that `sid` before
  ending the HTTP session. Other browsers of the same user are untouched. The SPA announces the sign-out on a
  `BroadcastChannel`; other tabs drop their tokens and open `/signed-out` at once.
- **Consequences:** an access token already issued to another device or a tab without `BroadcastChannel` stays valid
  until it expires (at most 15 minutes); resource servers do not check revocation.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 23.

## 2026-10-21 — Dependency updates arrive as two monthly Dependabot PRs reviewed by hand

- **Context:** one PR per dependency produced 14 open PRs a week, and a single grouped PR is all-or-nothing: a major
  upgrade that breaks the build blocks every safe patch in it.
- **Decision:** `.github/dependabot.yml` sends one monthly PR for GitHub Actions (merged when CI is green, then the
  first `docker-publish` run on `main` is checked) and one monthly multi-ecosystem PR for Gradle, npm and Docker.
  The second is reviewed in the bot branch: each update is taken (fixed there if needed) or reverted and recorded in
  `docs/TECH_DEBT.md` ("Deferred dependency migrations") with a task file. Majors are not ignored, so every one stays
  visible; the only ignore is `eclipse-temurin` majors, because the runtime moves between Java LTS releases by hand.
- **Consequences:** while a migration is deferred, the monthly PR arrives red and the same revert is repeated by hand.
- **Source:** Dependabot PR #80 review; commits `1e0fc15`, `3a97a5a` and the commit that dropped the major ignores.

## 2026-10-21 — Security patches ahead of Spring Boot override BOM properties

- **Context:** a patched Tomcat or Jackson can be out weeks before the Boot release that manages it, while
  `scan-images` fails on the published images.
- **Decision:** such a version goes to `gradle/libs.versions.toml` and `io.uliss.kotlin-conventions` sets the matching
  Boot BOM property as a project property (`extra["tomcat.version"]`). `mavenBom { bomProperty(...) }` does not work
  here: the Spring Boot plugin re-imports the BOM without it. Every override is listed in `docs/TECH_DEBT.md` with the
  Boot version that removes it.
- **Consequences:** one place for all modules; an override left behind pins the library below later BOM patches.
- **Source:** task `docs/tasks/2026-10-21-image-security-fixes.md`, block 1.
