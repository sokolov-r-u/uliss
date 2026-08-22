# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

Every task gets its own file in `docs/tasks/` (gitignored — local working state, never
committed), named `YYYY-MM-DD-<short-kebab-case-name>.md`; pick today's date and a short name
that fits the task at hand. Several tasks can be in flight at once as separate files (e.g. a
long-running docker task alongside a frontend task) — never collapse them into one file.

Every task follows this process:

1. Read CLAUDE.md + the task's file in `docs/tasks/` (if one already exists for this task)
   before starting
2. Read relevant module files before writing any code — never generate blind
3. Create or update the task file (`docs/tasks/YYYY-MM-DD-<name>.md`) with the plan before
   writing any code
4. If plan has 5+ steps or touches 3+ modules — stop and confirm with user
5. Execute plan one step at a time:

- Research/exploration steps: execute without stopping
- Code steps:
  a. Write code
  b. Write tests for new/changed behaviour if testable — see "Testing" for which kind
  c. Run ./gradlew :<module>:test — fix production code, not tests;
  never delete or weaken existing tests;
  if tests break or reveal bugs — stop and ask user
  d. Update the task file
  e. Stop and wait for user review before proceeding

6. After all steps complete — write integration tests covering
   end-to-end flow if applicable — see "Testing"

Deferred work that outlives a single task (agreed-upon but not implemented now) goes into
`docs/TECH_DEBT.md` instead — that file is tracked in git, unlike the per-task files above.

## Task file structure

`docs/tasks/YYYY-MM-DD-<name>.md`:

```
# Task: <name>

## Goal
One sentence — what and why.

## Plan
- [ ] Step 1
- [ ] Step 2

## Context
Minimal info needed: key constraints, relevant existing files.

## Artifacts
- `path/to/file.kt` — what it does
```

## Testing

Test kind depends on what's being verified — pick the narrowest one that exercises it:

- **Unit tests** — plain JUnit5 (`kotlin-test-junit5`) classes for domain/service logic, no
  Spring context; mock collaborators (Mockito). Default choice for new/changed logic in a class.
- **`@SpringBootTest`** — integration tests for main end-to-end flows through the real Spring
  context. Tag with `@Tag("integration")` and pull in `TestContainersConfiguration` (Testcontainers,
  `pgvector/pgvector`) when a real database is involved — see `AuthControllerTest` for the pattern.
  Runs only via `./gradlew :<module>:integrationTest` (needs Docker); untagged tests run under
  `./gradlew :<module>:test`.
- **`@WebMvcTest`** — for every new controller: web layer only, service layer mocked, no DB, no
  `integration` tag — runs under `:<module>:test`. See `ProfileControllerTest` for the pattern.
- **`@DataJpaTest`** — for repository methods with a custom `@Query`, to verify the JPQL/native
  SQL. Prefer H2 over Testcontainers here so it stays untagged and runs under `:<module>:test`.
  Plain inherited `JpaRepository` methods (`findById`, `save`, ...) generally aren't worth a
  dedicated test — that tests Spring Data, not our code.
- **Bug-fix regression tests** — every bug found gets a test that reproduces it before the fix,
  so it can't silently come back.

## Overview

`uliss` — a multi-module Kotlin + Spring Boot project (Gradle). Originally generated via
Spring Initializr. The `auth` module is already implemented as a working OAuth2 Authorization
Server (entities, controllers, services, JWK-key persistence, Flyway migrations);
the other modules are at varying degrees of completeness.

**Architecture:** broadly layered (`controller` → `service` → `repository`; the transport layer is
thin, business logic lives in `service`, the `@Transactional` boundary is there too). In
`user-service` — hexagonal-lite: logic lives in the domain, thin adapters (gRPC/REST), onboarding
steps as a Command pattern (see `module/user/user-app/CLAUDE.md`). Layer details — see the
"Anti-patterns" section and per-module `CLAUDE.md` files (pointers — see "Modules" below).

## Modules

Executable applications (directory `module/<name>`):

- `auth` (`io.uliss.auth`, `module/auth`) — Spring Boot application, OAuth2 Authorization
  Server (webmvc, security-oauth2-authorization-server) + server-rendered Thymeleaf login/
  registration pages, styled with the design system. Depends on `:database`, `:exception`, `:logging`,
  `:validation`, `:uliss-design-system` (serves `/ds/**`); pulls in `spring-boot-starter-thymeleaf`.
  Details — `module/auth/CLAUDE.md`.
- `user-service` (`io.uliss.user_service`, gradle module `:user` → `module/user/user-app`) — Spring Boot
  application. webmvc, validation, actuator + **gRPC server** (`spring-boot-starter-grpc-server`). Stores
  the user profile (schema `profile`) and drives **onboarding**. Depends on
  `:security`, `:database`, `:exception`, `:user-api`. The proto contract is factored out into a separate
  gradle module `:user-api` (`module/user/user-api`, package `io.uliss.api.user.v1`). Details —
  `module/user/user-app/CLAUDE.md`.
- `note-service` (`io.uliss.note_service`, gradle module `:note` → `module/note/note-app`) — Spring Boot
  application, **scaffold**: `POST /note/ask` via Spring AI on top of DeepSeek (model
  `deepseek-v4-flash`), plus a `note` schema for future RAG (pgvector). Depends on `:security`,
  `:database`, `:exception`, `:logging`, `:validation`. Details — `module/note/note-app/CLAUDE.md`.
- `web` (`@uliss/web`, `module/web`) — React SPA (Vite), frontend on top of `auth`/`user-service`.
  Same-origin, doesn't know service addresses directly. Details — `module/web/CLAUDE.md`.

Libraries (not executable, directory `module/lib/<name>`):

- `security` (`io.uliss.security`) — a shared security module with a **dual role**: (1) OAuth2
  Resource Server (validates JWTs); (2) **auth mediator** — `AuthController` (`/oauth2/**` inside
  the library; exposed externally under the prefix of whichever application consumes it — see the
  "Path-prefix convention" below) + `AuthService` perform the entire OAuth dance with the auth server
  on the frontend's behalf (confidential client + PKCE). Details — `module/lib/security/CLAUDE.md`.
- `database` (`io.uliss.database`) — JPA + Flyway + PostgreSQL.
- `exception` (`io.uliss.exception`) — global error handling + Spring Retry. The `RetryTemplate` bean
  is named `optimisticLockRetryTemplate` (not `retryTemplate`) — deliberately, to avoid a name
  collision with the auto-configured `retryTemplate` from AI starters (see
  `module/note/note-app/CLAUDE.md`); `RetryAspect` wires it in via `@Qualifier`.
- `logging` (`io.uliss.logging`) — AOP logging (AspectJ, `@MeasureTime` annotation).
  Depends on `:exception`.
- `validation` (`io.uliss.validation`) — custom bean-validation annotations (`@Email`,
  `@Password`). Depends on `:exception`.
- `monitoring` (`io.uliss.monitoring`) — shared actuator config: `api("...spring-boot-starter-actuator")`
  + `monitoring.yml` (`management.endpoints.web.exposure.include: health`). Used by `auth`/`user`/`note`
    for `/actuator/health` (docker-compose healthchecks); it isn't otherwise `permitAll`, so `auth`'s own
    `SecurityConfig` opens it up explicitly, while `user`/`note` get it for free from the shared
    `:security` library's `SecurityConfig` (see `module/lib/security/CLAUDE.md`).

The mapping between module name and directory is defined in `settings.gradle.kts` (e.g.
`:security` → `module/lib/security`).

- `uliss-design-system` (`module/lib/uliss-design-system`) — a shared design system: a single
  source of styles for both server-rendered Thymeleaf pages (`auth`) and the React app (`web`). The
  folder is **simultaneously** an npm package `@uliss/design-system` (source in `src/`: CSS tokens,
  self-hosted OFL fonts, `.tsx` components) **and** a Gradle module `:uliss-design-system`. Details —
  `module/lib/uliss-design-system/CLAUDE.md`.

## Build & test

Uses the Gradle wrapper (Gradle 9.3 — runs on JDK 25). Toolchain and bytecode target — **Java 25**
(`languageVersion` from `java`, `options.release` / `jvmTarget` from `java-compile` — both `25` in the
catalog), Kotlin 2.3.21, Spring Boot 4.1.0. Exact versions — in `gradle/libs.versions.toml`.

```bash
./gradlew build                      # build everything + tests
./gradlew :auth:test                 # unit tests for one module
./gradlew :auth:integrationTest      # integration tests (needs Docker — Testcontainers)
./gradlew :auth:bootRun              # run the auth application
./gradlew :user:bootRun              # run user-service
./gradlew jacocoRootReport           # merged JaCoCo report across all modules (test + integrationTest, if run)
./gradlew buildAllImages             # build all local Docker images (auth/user/note via Jib, web via docker build) — see docs/DEPLOYMENT.md
```

`jacocoRootReport` merges per-module JaCoCo exec data (`test` + `integrationTest`) across all
subprojects except `uliss-design-system` into one report
(`build/reports/jacoco/jacocoRootReport/{html/index.html,jacocoRootReport.xml}`). Full rationale
(CRC64 exec↔classes matching, why shared libs without their own tests still get coverage, what's
excluded and why) — `docs/ARCHITECTURE.md`.

Integration tests spin up PostgreSQL via Testcontainers
(`TestContainersConfiguration`, image `pgvector/pgvector`), so a running Docker
daemon is required.

Libraries (`security`, `database`, `exception`, `logging`, `validation`) — no `bootRun`.

### Running locally (env + DB)

Applications read their config from environment variables — without them `bootRun` won't start. Local
infrastructure lives under `infra/`:

- `infra/docker-compose.yml` — PostgreSQL (`pgvector/pgvector`, port 5432). Start it with:
  `docker compose -f infra/docker-compose.yml up -d`.
- `infra/.env` — actual values (copy from `infra/env.example.properties` if missing).

Key variables: `POSTGRES_URL`, **`AUTH_PUBLIC_URL`** (browser-facing: authorize redirect +
issuer) / **`AUTH_INTERNAL_URL`** (service-to-service: token/revoke/jwks) — locally both
`http://auth.uliss.local:9000` (see `module/lib/security/CLAUDE.md`), `ALLOWED_CORS_URLS`, `FRONTEND_URL`
(`http://uliss.local:3000`), **`AUTH_CLIENT_CALLBACK_URLS`** (CSV of all allowed callbacks —
local + k8s; the client accepts any of them), `AUTH_SECURE_COOKIE`, `FRONTEND_CLIENT_ID/SECRET`
(the confidential web client `uliss-web` — used by `:security`), `APP_CLIENTS_M2M_*` (the m2m client
`uliss-internal`), `USER_SERVICE_URL` (Vite dev-proxy target, **without** the `VITE_` prefix), ports
`AUTH_SERVER_PORT=9000` / `USER_SERVER_PORT=8080` / `NOTE_SERVER_PORT=8081`, `DEEPSEEK_API_KEY` /
`DEEPSEEK_MODEL` (defaults to `deepseek-v4-flash`, the key may be empty — the service starts, but
`/ask` returns a DeepSeek auth error). `*.uliss.local` hosts are resolved via `/etc/hosts`
(see `infra/etc.hosts`). Each application has its own datasource with its own schema via
`?currentSchema=<schema>` (`auth` → `auth`, `user-service` → `profile`, `note-service` → `note`).

### Running the full stack (Docker Compose / Kubernetes)

Two supported paths beyond host-based `bootRun`: plain Docker Compose (`docker compose -f
infra/docker-compose.yml --profile full up -d`, no cluster needed) or minikube via `skaffold run`
(manifests + kustomize under `infra/`, `kubectl apply -k infra`). Both build the same images
(Jib for `auth`/`user`/`note`, `docker build` for `web`). Env-var overrides per environment,
Ingress routing, CI image publish (GHCR), and the custom base-JRE image — all in
`docs/DEPLOYMENT.md`.

## IDE integration (IntelliJ MCP)

The `idea` MCP server is connected. Useful where the IDE knows more than the files on disk:

- `get_file_problems` — compile/inspection errors for a file **instead of** a full `./gradlew build`
  (an order of magnitude faster). Caveat: the result is only valid if the IDE has reindexed — on
  external edits IntelliJ lags behind, so the final check is still `./gradlew build`.
- `execute_sql_query` / `preview_table_data` — the actual state of the `auth` and `profile` schemas
  while debugging (e.g. `profile.user_message` in onboarding), instead of guessing from Flyway
  migrations.
- `get_project_dependencies` / `get_project_modules` — the actual module graph from the Gradle import.
- `search_symbol` / `get_symbol_info` / `rename_refactoring` — symbol resolution and safe renaming
  across the whole project (unlike text-based grep).

File edits — via regular Edit/Write (visible in the diff), not via `idea` tools.

## Versions: single source of truth

All versions live **only** in `gradle/libs.versions.toml` — the single source of truth,
versions must be changed there. The root build gets the `libs` catalog automatically. Convention
plugins are factored out into an **included build** `module/lib/gradle-plugins` (wired in via
`includeBuild` in `pluginManagement`), and the same catalog is explicitly forwarded into it via
`from(files("../../../gradle/libs.versions.toml"))` in `gradle-plugins/settings.gradle.kts`.

Inside a precompiled script plugin, the type-safe `libs` accessor isn't available (gradle/gradle#15383),
so in `io.uliss.kotlin-conventions.gradle.kts` the catalog is read via the runtime API
`VersionCatalogsExtension` (`findVersion`/`findLibrary`). Versions of BOM-managed starters
(`spring-boot-starter-*`) are not put in the catalog — their version is already unified via the BOM
version.

## Convention plugins

Shared configuration is factored out into the included build `module/lib/gradle-plugins`:
`io.uliss.kotlin-conventions` (base Kotlin/Spring library setup), `io.uliss.spring-boot-app`
(executable applications — `auth`, `user-service`, ...), `io.uliss.jpa-conventions` (JPA entities —
`auth`, `database`). Mechanics (why the type-safe `libs` accessor isn't available inside a
precompiled script plugin, how plugin versions are wired) — `docs/ARCHITECTURE.md`.

## Library auto-configuration & config

Libraries self-configure and are picked up by applications without explicit bean imports: each lib
registers its own `*AutoConfiguration` via `AutoConfiguration.imports`, and places a `<module>.yml`
that the application pulls in via `spring.config.import: classpath:<module>.yml`. Full mechanics —
`docs/ARCHITECTURE.md`.

## Closed decisions (do not revisit)

Final decisions — do not reopen. History is in prior discussion and per-module `CLAUDE.md`; here is the
summary of "don't touch this":

- **SPA tokens live in the browser's `sessionStorage`; a BFF is deferred** (needs a shared point —
  a gateway/Redis — that doesn't exist yet). See `module/lib/security/CLAUDE.md` ("SPA token strategy").
- **A mediator service (`:security` `/oauth2/*`), not a direct SPA→AS flow** — the SPA doesn't know the
  auth server's address; the OAuth client is confidential.
- **The token's `sub` = `auth.users.id` (UUID), not email** — a stable OIDC subject, no PII.
- **Registration is server-form only** (`AuthController`); the REST `/auth/register` was deliberately
  removed — the password never reaches the SPA.
- **`displayName` lives in `user-service`, not in auth** — auth only stores email+password.
- **Login is blocked if user-service is unavailable** — a token without `userId` is incomplete (a
  deliberate availability trade-off).
- **Split-horizon auth URL** — `AUTH_PUBLIC_URL` (browser-facing) vs `AUTH_INTERNAL_URL`
  (service-to-service). See `module/lib/security/CLAUDE.md`.
- **Database-per-service** — its own schema per application (`auth` → `auth`, `user-service` →
  `profile`, `note-service` → `note`), no shared schema.
- **`uliss-web` is a confidential client, not public** — it's used by a service (`:security`), so the
  `refresh_token` grant is deliberately enabled.

## Operational constraints (hard limits — never do without explicit per-request permission)

These are absolute limits on what commands may be run. They override any convenience or
verification step. Ask the user and get explicit approval each time before crossing any of them.

- **Never run `kill`** (or `pkill`, `kill -9`, killing processes by PID/port) — do not stop
  processes. If a process must be stopped, ask the user to do it.
- **Never run the application** — no `bootRun`, no launching a service/jar, no starting the app in
  any form. Running the app was NOT authorized.
- **Never run scripts or write commands against the database** — no migrations run by hand, no DDL/DML,
  no `psql`/`docker exec ... psql`, no touching the user's database. Database access is read-only and
  only when the user explicitly asks for it.
- **The only things allowed to run freely are the app's tests** (`./gradlew :<module>:test` /
  `:integrationTest`) and read-only build/compile tasks. Anything beyond that needs explicit permission.

## Anti-patterns (never do)

- No field injection — **constructor injection only**.
- No business logic in controllers or repositories — logic belongs in `service`.
- No direct repository calls from controllers.
- No Spring / JPA annotations inside domain classes (hexagonal-lite layers in `user-service`).
- No `!!` in Kotlin without a one-line justification comment.
- No version changes outside `gradle/libs.versions.toml` (see "Versions: single source of truth").
- No Russian in code, comments, logs, or commit messages (see "Notes").
- No `TODO`/`FIXME` comments in code — track them in the active task file under `docs/tasks/`.
- Package root — `io.uliss.<module>` (see "Conventions").

### Known deviations (to reconcile)

Known debt — not a template for new code, bring into line the next time these files are touched:

- `!!` without justification (4 places): `module/lib/security/src/main/kotlin/utils/SecurityUtils.kt:23`
  (a real risk — `response` can be null outside a request context → replace with a check/exception);
  `module/auth/.../config/DataInitializer.kt:47,72` and `module/auth/.../service/UserService.kt:31`
  (platform type from `passwordEncoder.encode` — safe, add a justification comment).
- The `utils` package in `SecurityUtils.kt` instead of `io.uliss.security.utils` — rename during the
  next refactor.
- JaCoCo (`jacocoTestReport`, `io.uliss.kotlin-conventions`) is wired into `check`, but
  `jacocoTestCoverageVerification` is **not** configured (no threshold, the build doesn't fail on
  coverage). Add a threshold + gate once test coverage has grown enough for a threshold to be
  meaningful rather than an arbitrary number.

## Conventions

- **Path-prefix convention:** each executable app whose paths are shared under `uliss.local` (`user`,
  `note`) declares its own `WebMvcPathPrefixConfig` (`WebMvcConfigurer` + `addPathPrefix`, scoped to
  `HandlerTypePredicate.forAnnotation(RestController::class)`) that prefixes **every** `@RestController`
  bean in that app's context — including imported library controllers like `:security`'s
  `AuthController` — with the app's own name (`/user`, `/note`). A new controller in `user`/`note` never
  needs its own path prefix; add the config once per app, not per class. `:security`'s permitAll matcher
  (`/oauth2/**, /*/oauth2/**` — bare for `:security`'s own tests, wildcard-prefixed for the mediator
  under a consuming app) is written prefix-agnostic for the same reason. `auth` (the real Authorization Server)
  intentionally has **no** such config — it lives on its own host (`auth.uliss.local`), and its
  `/oauth2/**` paths are Spring Authorization Server's own spec/library-fixed endpoints, unrelated to
  this convention.
  - Rejected `server.servlet.context-path`: it is wired only through
    `ServletWebServerFactoryCustomizer` for the real embedded container and is **not** applied to
    `MockMvc` under `@WebMvcTest`/`@SpringBootTest`+`@AutoConfigureMockMvc` (`MockServletContext` never
    receives it) — tests would silently diverge from production routing.
- Package root: `io.uliss.<module>`.
- Persistence: Flyway migrations + PostgreSQL. Migrations live under
  `src/main/resources/db/migration`, naming `V<n>__ddl_*.sql` (present in `auth` and
  `user-service`). The schema is set per-app via
  `spring.flyway.schemas` / `default-schema` + `hibernate.default_schema`.
- JSON: Jackson Kotlin module (`tools.jackson.module:jackson-module-kotlin`).
- Tests: use `spring-boot-starter-*-test` starters and `kotlin-test-junit5`.
  `failOnNoDiscoveredTests = false` is temporarily enabled while there are few tests. See
  "Testing" for which kind of test to write.

## Notes

- `HELP.md` in each module is Spring Initializr auto-generated (in `.gitignore`), do not edit.
- When adding a new executable service: create a module under `module/<name>`, apply
  `id("io.uliss.spring-boot-app")`, add `include(...)` and `projectDir` in
  `settings.gradle.kts`.
- When adding a new library: create a module under `module/lib/<name>`, apply
  `id("io.uliss.kotlin-conventions")`, wire it into `settings.gradle.kts` the same way.
- All comments in the project are in English only. No Russian words are to be used anywhere in the
  project. Comments should be used only where necessary, and should contain as little text as possible.
