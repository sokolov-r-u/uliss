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
