# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

Every task follows this process:

1. Read CLAUDE.md + docs/CURRENT_TASK.md before starting
2. Read relevant module files before writing any code — never generate blind
3. Create or update CURRENT_TASK.md with the plan before writing any code
4. If plan has 5+ steps or touches 3+ modules — stop and confirm with user
5. Execute plan one step at a time:

- Research/exploration steps: execute without stopping
- Code steps:
  a. Write code
  b. Write unit tests for new/changed behaviour if testable
  c. Run ./gradlew :<module>:test — fix production code, not tests;
  never delete or weaken existing tests;
  if tests break or reveal bugs — stop and ask user
  d. Update CURRENT_TASK.md
  e. Stop and wait for user review before proceeding

6. After all steps complete — write integration tests covering
   end-to-end flow if applicable

## CURRENT_TASK.md structure

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

The mapping between module name and directory is defined in `settings.gradle.kts` (e.g.
`:security` → `module/lib/security`).

- `uliss-design-system` (`module/lib/uliss-design-system`) — a shared design system: a single
  source of styles for both server-rendered Thymeleaf pages (`auth`) and the React app (`web`). The
  folder is **simultaneously** an npm package `@uliss/design-system` (source in `src/`: CSS tokens,
  self-hosted OFL fonts, `.tsx` components) **and** a Gradle module `:uliss-design-system`. Details —
  `module/lib/uliss-design-system/CLAUDE.md`. The frontend and auth-UI plan lives at
  `docs/plans/2026-06-25-frontend-auth-ui-plan.md`.

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
```

`jacocoRootReport` (root `build.gradle.kts`) merges per-module `build/jacoco/{test,integrationTest}.exec` +
`build/classes/kotlin/main` from all subprojects except `uliss-design-system` into a single
`build/reports/jacoco/jacocoRootReport/{html/index.html,jacocoRootReport.xml}`. Both jacoco tasks
(the per-module `jacocoTestReport` and `jacocoRootReport`) merge exec data from both `test` and
`integrationTest` (JaCoCo attaches to both automatically — both tasks are of type `Test`; JaCoCo
matches exec↔classes by the CRC64 hash of the bytecode, not by project, so shared libraries without
their own tests, e.g. `:database`, correctly get coverage from the exec of whichever modules actually
use them). `integrationTest` is not forced via `dependsOn` — it requires Docker/Testcontainers,
so `./gradlew build`/`check` stay Docker-independent; its exec is only picked up if it's already on
disk from a previous run. Modules without a `test.exec`/`integrationTest.exec` are skipped lazily
(`fileTree` over existing files), which doesn't fail the task. Excluded from classDirectories are
`io/uliss/api/**` (generated protobuf/gRPC) and `**/*ApplicationKt.class`
(the Kotlin file-class with a top-level `fun main()` — unreachable by any test: `@SpringBootTest`
boots the context via `SpringApplicationBuilder` directly, without calling `main()`, and actually
running the application is prohibited — see "Operational constraints").

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

### Running the full stack locally (Docker Compose, no minikube)

An alternative to minikube for everyday local dev — no cluster, no `kubectl`/`skaffold`. Runs the
same images the k8s path builds, orchestrated by plain Docker Compose instead. **The minikube/skaffold
path below is unchanged and still fully supported** — this is an additional option, not a replacement.

- Add `127.0.0.1 uliss.local` to your real `/etc/hosts` (see `infra/etc.hosts` for the full list,
  including `auth.uliss.local` etc., already needed for host-based `bootRun` dev).
- Build the images once (same commands as the k8s manual fallback below):
  `./gradlew :auth:jibDockerBuild :user:jibDockerBuild :note:jibDockerBuild` and
  `docker build -t uliss/web:latest -f module/web/Dockerfile .`.
- `docker compose -f infra/docker-compose.yml --profile full up -d` — brings up `postgres` plus
  `auth`/`user`/`note`/`web`. Plain `docker compose -f infra/docker-compose.yml up -d` (no
  `--profile full`) keeps starting only `postgres`, for the host-based `bootRun` flow above.
- `auth`/`user`/`note` read `infra/.env` via `env_file`, with two container-only overrides on top:
  `USER_SERVICE_HOST=user` on `auth` (its gRPC client target — `localhost` only makes sense for
  host-based `bootRun`) and `FRONTEND_URL=http://uliss.local` on `user`/`note` (the OAuth
  `redirect-uri` `:security` builds — the compose `web` container serves on `:80`, not the Vite dev
  port `:3000`). `auth` also gets a Compose network alias `auth.uliss.local`, so
  `AUTH_PUBLIC_URL`/`AUTH_INTERNAL_URL` need no override — the same hostname resolves from both the
  host browser and sibling containers.
- Same-origin SPA routing (`/user`, `/note`) has no Ingress to do it here, so `module/web/nginx.conf`
  proxies those paths itself (see "web" below) — inert under k8s.
- Rebuild + `docker compose -f infra/docker-compose.yml --profile full up -d` again to pick up new
  images (`:latest` + Compose recreates a service when its image content changes).

### Deploying to Kubernetes (minikube)

Manifests and kustomize live under `infra/`, deployed with one command: `kubectl apply -k infra`.

- **A single kustomization** (`infra/kustomization.yaml`): `secretGenerator` from `infra/.env` (shared
  with Docker/IntelliJ, `disableNameSuffixHash: true` → the name `uliss-secret` is stable) + `patches:`
  onto `k8s/patch-k8s-secret.yaml`. The patch, via `stringData`, **overrides** only the "address" keys
  for k8s (`POSTGRES_URL`, `AUTH_PUBLIC_URL`, `AUTH_INTERNAL_URL`, `FRONTEND_URL`) — `stringData`
  wins over `data` on apply. This way local and k8s don't collide without a second env file/overlay
  (an overlay inside `infra/` isn't possible — kustomize flags a cycle; hence the patch instead).
- **Ingress** (`k8s/ingress.yaml`) — by host, `auth.uliss.local` → `auth:9000`, `user.uliss.local` →
  `user:8080`, `note.uliss.local` → `note:8081`, and on `uliss.local` **path-routing** (same-origin for
  the SPA): `/user` → `user:8080`, `/note` → `note:8081`, `/` → `web:80`. Each service serves its whole
  path under its own name (see "Path-prefix convention" below) — one rule per service instead of
  one per resource.
- **`web`** — image built from `module/web/Dockerfile` (multi-stage: node build → `nginx:alpine`), where
  `module/web/nginx.conf` provides SPA fallback (`try_files $uri /index.html`) + `no-store` on `index.html`,
  immutable on `/assets/`. Without it, client-side routes (`/callback`) would return 404. It also proxies
  `/user/` and `/note/` to those services — needed for same-origin routing under plain `docker compose`
  (no ingress there); inert under k8s, where Ingress routes those paths before they reach this pod.
- **Images:** `auth`/`user`/`note` — Jib (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild
  :note:jibDockerBuild`, config — `io.uliss.docker-conventions`, `uliss/<project>:latest`); `web` —
  `docker build -t uliss/web:latest -f module/web/Dockerfile .`.
- **Base JRE image (`docker.jre.version` in `gradle.properties`):** not the stock `eclipse-temurin`
  tag — `ghcr.io/<owner>/base-jre:<tag>`, our own image (`infra/docker/base-jre/Dockerfile`,
  published by `.github/workflows/base-jre-publish.yml` as a multi-arch `linux/amd64,linux/arm64`
  manifest, since the same tag is pulled both locally on Apple Silicon and by CI on amd64). It's
  `eclipse-temurin:25.0.3_9-jre` (Ubuntu/glibc) plus `curl`, kept installed — Adoptium's own
  Dockerfile installs `wget`/`gnupg` only to download the JDK, then purges both before publishing,
  so the stock tag has no HTTP client for `infra/docker-compose.yml`'s `auth`/`user`/`note`
  healthchecks (`curl -f http://localhost:<port>/actuator/health`) to use. The `-alpine` tag would
  have `wget` built in via BusyBox for free, but was rejected: musl libc's DNS resolver has a
  history of issues in `ndots`/search-domain-heavy `resolv.conf` setups like k8s's, and glibc was
  preferred deliberately.
- **Workflow under minikube — `skaffold run`** (`skaffold.yaml` at repo root). One command: builds
  all three images **straight into minikube's docker daemon** (Skaffold auto-detects the context —
  `eval $(minikube docker-env)` isn't needed), deploys via kustomize (`infra/`), and rolls out
  automatically. The rollout triggers by itself because Skaffold tags images with a unique digest and
  swaps `uliss/<svc>:latest` in the manifests for `uliss/<svc>:<digest>` — changing the reference means
  a new pod (works around the `:latest`+`IfNotPresent` problem).
  Builders: `auth`/`user` — Jib (artifacts `jib.project: auth|user`), `web` — Docker (`module/web/Dockerfile`).
  `skaffold delete` — tear it down. When editing shared libs (`:security` etc.), Jib rebuilds the dependent
  services on its own.
- **Manual (fallback / what Skaffold does under the hood):** `eval $(minikube docker-env)` (in the
  **same** shell — otherwise the build goes to the local docker and the cluster can't see it) → rebuild
  images (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild :note:jibDockerBuild`; `docker build -t
  uliss/web:latest -f module/web/Dockerfile .`) → `kubectl apply -k infra` →
  **`kubectl rollout restart deploy/<auth|user|note|web>`**
  (env from `envFrom.secretRef` and the `:latest`+`IfNotPresent` image are only picked up when the pod
  is recreated).

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

Shared configuration is factored out into the included build `module/lib/gradle-plugins` (not
duplicated across modules):

- `io.uliss.kotlin-conventions` — base Kotlin/Spring module (library): toolchain,
  `group = io.uliss`, Spring BOM via dependency-management, compiler flags
  (`-Xjsr305=strict`, strict null-safety, `-Xmulti-dollar-interpolation`), JUnit Platform,
  the `integrationTest` task, JaCoCo coverage report (`test` only).
- `io.uliss.spring-boot-app` — inherits `kotlin-conventions` + applies the plugin
  `org.springframework.boot`. For executable applications (`auth`, `user-service`).
- `io.uliss.jpa-conventions` — applies `org.jetbrains.kotlin.plugin.jpa` (no-arg for
  JPA entities). Apply in modules with JPA entities (`auth`, `database`).

Versions of build plugins (kotlin-gradle-plugin, spring-boot-gradle-plugin, etc.) are declared
as `[libraries]` in `gradle/libs.versions.toml` and wired in
`gradle-plugins/build.gradle.kts` via `implementation(libs.*)`.

## Library auto-configuration & config

Libraries self-configure and are picked up by applications without explicit bean imports:

- Each lib registers its own `*AutoConfiguration` via
  `src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
  (`security`, `database`, `exception`, `logging`).
- A lib places `<module>.yml` (`database.yml`, `exception.yml`, `security.yml`) in its
  resources, and the application imports it in its own `application.yaml` via
  `spring.config.import: classpath:<module>.yml`
  (example — `module/auth/src/main/resources/application.yaml`).

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
- No `TODO`/`FIXME` comments in code — track them in `## Decisions` inside `docs/CURRENT_TASK.md`.
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
  `failOnNoDiscoveredTests = false` is temporarily enabled while there are few tests.

## Notes

- `HELP.md` in each module is Spring Initializr auto-generated (in `.gitignore`), do not edit.
- When adding a new executable service: create a module under `module/<name>`, apply
  `id("io.uliss.spring-boot-app")`, add `include(...)` and `projectDir` in
  `settings.gradle.kts`.
- When adding a new library: create a module under `module/lib/<name>`, apply
  `id("io.uliss.kotlin-conventions")`, wire it into `settings.gradle.kts` the same way.
- All comments in the project are in English only. No Russian words are to be used anywhere in the
  project. Comments should be used only where necessary, and should contain as little text as possible.
