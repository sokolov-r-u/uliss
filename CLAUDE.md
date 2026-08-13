# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

Every task follows this process:

1. Read CLAUDE.md + docs/CURRENT_TASK.md before starting
2. Read relevant module files before writing any code — never generate blind
3. Create or update CURRENT_TASK.md with the plan before writing any code
4. If plan has 5+ steps or touches 3+ modules — stop and confirm with user
5. Execute plan step by step, marking each item done as you go
6. Run ./gradlew :<module>:test after each logical step — fix production code, not tests
7. After completion — update CURRENT_TASK.md

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

`uliss` — многомодульный проект на Kotlin + Spring Boot (Gradle). Изначально сгенерирован
через Spring Initializr. Модуль `auth` уже реализован как рабочий OAuth2 Authorization
Server (сущности, контроллеры, сервисы, персистенция JWK-ключей, Flyway-миграции);
остальные модули — в разной степени готовности.

**Архитектура:** в целом layered (`controller` → `service` → `repository`; транспорт тонкий,
бизнес-логика в `service`, `@Transactional`-граница там же). В `user-service` — hexagonal-lite:
логика в домене, тонкие адаптеры (gRPC/REST), онбординг-шаги как паттерн Command (см.
`module/user/user-app/CLAUDE.md`). Детали слоёв — секция «Anti-patterns» и per-module `CLAUDE.md`
(указатели — в «Modules» ниже).

## Modules

Исполняемые приложения (директория `module/<name>`):

- `auth` (`io.uliss.auth`, `module/auth`) — Spring Boot приложение, OAuth2 Authorization
  Server (webmvc, security-oauth2-authorization-server) + серверные Thymeleaf-страницы входа/
  регистрации, стилизованные дизайн-системой. Зависит от `:database`, `:exception`, `:logging`,
  `:validation`, `:uliss-design-system` (отдаёт `/ds/**`); подключает `spring-boot-starter-thymeleaf`.
  Подробности — `module/auth/CLAUDE.md`.
- `user-service` (`io.uliss.user_service`, gradle-модуль `:user` → `module/user/user-app`) — Spring Boot
  приложение. webmvc, validation, actuator + **gRPC-сервер** (`spring-boot-starter-grpc-server`). Хранит
  профиль пользователя (схема `profile`) и ведёт **онбординг**. Зависит от
  `:security`, `:database`, `:exception`, `:user-api`. Proto-контракт вынесен в отдельный gradle-модуль
  `:user-api` (`module/user/user-api`, пакет `io.uliss.api.user.v1`). Подробности —
  `module/user/user-app/CLAUDE.md`.
- `note-service` (`io.uliss.note_service`, gradle-модуль `:note` → `module/note/note-app`) — Spring Boot
  приложение, **scaffold**: `POST /note/ask` через Spring AI поверх DeepSeek (модель
  `deepseek-v4-flash`), плюс схема `note` под будущий RAG (pgvector). Зависит от `:security`,
  `:database`, `:exception`, `:logging`, `:validation`. Подробности — `module/note/note-app/CLAUDE.md`.
- `web` (`@uliss/web`, `module/web`) — React SPA (Vite), фронтенд поверх `auth`/`user-service`.
  Same-origin, не знает адресов сервисов напрямую. Подробности — `module/web/CLAUDE.md`.

Библиотеки (не исполняемые, директория `module/lib/<name>`):

- `security` (`io.uliss.security`) — общий модуль безопасности с **двойной ролью**: (1) OAuth2
  Resource Server (валидирует JWT); (2) **auth-посредник** — `AuthController` (`/oauth2/**` внутри
  библиотеки; наружу отдаётся под префиксом приложения, которое его подключает — см. «Path-prefix
  convention» ниже) + `AuthService` делают за фронт весь OAuth-танец с auth-сервером (confidential-
  клиент + PKCE). Подробности — `module/lib/security/CLAUDE.md`.
- `database` (`io.uliss.database`) — JPA + Flyway + PostgreSQL.
- `exception` (`io.uliss.exception`) — глобальная обработка ошибок + Spring Retry. Бин
  `RetryTemplate` называется `optimisticLockRetryTemplate` (не `retryTemplate`) — намеренно, чтобы не
  коллизировать по имени с автоконфигурируемым `retryTemplate` AI-стартеров (см.
  `module/note/note-app/CLAUDE.md`); `RetryAspect` подключает его через `@Qualifier`.
- `logging` (`io.uliss.logging`) — AOP-логирование (AspectJ, аннотация `@MeasureTime`).
  Зависит от `:exception`.
- `validation` (`io.uliss.validation`) — кастомные bean-validation аннотации (`@Email`,
  `@Password`). Зависит от `:exception`.

Соответствие имени модуля и директории задаётся в `settings.gradle.kts` (например
`:security` → `module/lib/security`).

- `uliss-design-system` (`module/lib/uliss-design-system`) — общая дизайн-система: единый
  источник стилей для серверных Thymeleaf-страниц (`auth`) и React-приложения (`web`). Папка —
  **одновременно** npm-пакет `@uliss/design-system` (исходник `src/`: CSS-токены, self-host
  шрифты OFL, `.tsx`-компоненты) **и** Gradle-модуль `:uliss-design-system`. Подробности —
  `module/lib/uliss-design-system/CLAUDE.md`. План фронтенда и auth-UI —
  `docs/plans/2026-06-25-frontend-auth-ui-plan.md`.

## Build & test

Используется Gradle wrapper (Gradle 9.3 — запускается на JDK 25). Toolchain и байткод — **Java 25**
(`languageVersion` из `java`, `options.release` / `jvmTarget` из `java-compile` — обе `25` в каталоге),
Kotlin 2.3.21, Spring Boot 4.1.0. Конкретные версии — в `gradle/libs.versions.toml`.

```bash
./gradlew build                      # собрать всё + тесты
./gradlew :auth:test                 # unit-тесты одного модуля
./gradlew :auth:integrationTest      # integration-тесты (нужен Docker — Testcontainers)
./gradlew :auth:bootRun              # запустить приложение auth
./gradlew :user:bootRun              # запустить user-service
```

Integration-тесты поднимают PostgreSQL через Testcontainers
(`TestContainersConfiguration`, образ `pgvector/pgvector`), поэтому требуется запущенный
Docker.

Библиотеки (`security`, `database`, `exception`, `logging`, `validation`) — без `bootRun`.

### Локальный запуск (env + БД)

Приложения читают конфиг из переменных окружения — без них `bootRun` не стартует. Локальная
инфраструктура лежит в `infra/`:

- `infra/docker-compose.yml` — PostgreSQL (`pgvector/pgvector`, порт 5432). Поднять:
  `docker compose -f infra/docker-compose.yml up -d`.
- `infra/.env` — реальные значения (скопировать из `infra/env.example.properties`, если нет).

Ключевые переменные: `POSTGRES_URL`, **`AUTH_PUBLIC_URL`** (browser-facing: authorize-редирект +
issuer) / **`AUTH_INTERNAL_URL`** (service-to-service: token/revoke/jwks) — локально оба
`http://auth.uliss.local:9000` (см. `module/lib/security/CLAUDE.md`), `ALLOWED_CORS_URLS`, `FRONTEND_URL`
(`http://uliss.local:3000`), **`AUTH_CLIENT_CALLBACK_URLS`** (CSV всех разрешённых callback —
локальный + k8s; клиент принимает любой), `AUTH_SECURE_COOKIE`, `FRONTEND_CLIENT_ID/SECRET`
(confidential web-клиент `uliss-web` — им пользуется `:security`), `APP_CLIENTS_M2M_*` (m2m-клиент
`uliss-internal`), `USER_SERVICE_URL` (target dev-прокси Vite, **без** `VITE_`-префикса), порты
`AUTH_SERVER_PORT=9000` / `USER_SERVER_PORT=8080` / `NOTE_SERVER_PORT=8081`, `DEEPSEEK_API_KEY` /
`DEEPSEEK_MODEL` (по умолчанию `deepseek-v4-flash`, ключ может быть пустым — сервис стартует, но
`/ask` вернёт ошибку авторизации DeepSeek). Хосты `*.uliss.local` резолвятся через `/etc/hosts`
(см. `infra/etc.hosts`). У каждого приложения свой datasource со своей схемой через
`?currentSchema=<schema>` (`auth` → `auth`, `user-service` → `profile`, `note-service` → `note`).

### Деплой в Kubernetes (minikube)

Манифесты и kustomize — в `infra/`, деплой одной командой: `kubectl apply -k infra`.

- **Один kustomization** (`infra/kustomization.yaml`): `secretGenerator` из `infra/.env` (общий с
  Docker/IntelliJ, `disableNameSuffixHash: true` → имя `uliss-secret` стабильно) + `patches:` на
  `k8s/patch-k8s-secret.yaml`. Патч через `stringData` **переопределяет** для k8s только «адресные»
  ключи (`POSTGRES_URL`, `AUTH_PUBLIC_URL`, `AUTH_INTERNAL_URL`, `FRONTEND_URL`) — `stringData`
  побеждает `data` при apply. Так локаль и k8s не мешают друг другу без второго env-файла/overlay
  (overlay внутри `infra/` невозможен — kustomize ловит cycle; поэтому именно патч).
- **Ingress** (`k8s/ingress.yaml`) — по хостам `auth.uliss.local` → `auth:9000`, `user.uliss.local` →
  `user:8080`, `note.uliss.local` → `note:8081`, а на `uliss.local` **path-routing** (same-origin для
  SPA): `/user` → `user:8080`, `/note` → `note:8081`, `/` → `web:80`. Каждый сервис отдаёт весь свой
  путь под собственным именем (см. «Path-prefix convention» ниже) — одно правило на сервис вместо
  одного на каждый ресурс.
- **`web`** — образ из `module/web/Dockerfile` (multi-stage: node build → `nginx:alpine`), где
  `module/web/nginx.conf` даёт SPA-fallback (`try_files $uri /index.html`) + `no-store` на `index.html`,
  immutable на `/assets/`. Без него клиентские роуты (`/callback`) отдавали бы 404.
- **Образы:** `auth`/`user` — Jib (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild`, конфиг —
  `io.uliss.docker-conventions`, `uliss/<project>:latest`); `web` — `docker build -t uliss/web:latest
  -f module/web/Dockerfile .`.
- **Рабочий цикл под minikube — `skaffold run`** (`skaffold.yaml` в корне репо). Одна команда: собирает
  все три образа **прямо в docker-демон minikube** (Skaffold сам детектит контекст — `eval $(minikube
  docker-env)` не нужен), деплоит через kustomize (`infra/`) и делает rollout автоматически. Rollout
  срабатывает сам, потому что Skaffold тегирует образы уникальным digest'ом и подменяет `uliss/<svc>:latest`
  в манифестах на `uliss/<svc>:<digest>` — смена ссылки = новый под (обходит проблему `:latest`+`IfNotPresent`).
  Билдеры: `auth`/`user` — Jib (артефакты `jib.project: auth|user`), `web` — Docker (`module/web/Dockerfile`).
  `skaffold delete` — снести. При правке общих lib (`:security` и т.п.) Jib пересоберёт зависящие сервисы сам.
- **Вручную (fallback / что делает Skaffold под капотом):** `eval $(minikube docker-env)` (в **том же**
  окне — иначе build уходит в локальный docker и кластер его не видит) → пересобрать образы
  (`./gradlew :auth:jibDockerBuild :user:jibDockerBuild`; `docker build -t uliss/web:latest -f
  module/web/Dockerfile .`) → `kubectl apply -k infra` → **`kubectl rollout restart deploy/<auth|user|web>`**
  (env из `envFrom.secretRef` и образ `:latest`+`IfNotPresent` подхватываются только при пересоздании пода).

## IDE integration (IntelliJ MCP)

Подключён MCP-сервер `idea`. Полезен там, где IDE знает больше, чем файлы на диске:

- `get_file_problems` — ошибки компиляции/инспекции по файлу **вместо** полной `./gradlew build`
  (быстрее на порядок). Оговорка: результат валиден только если IDE переиндексировала — при правках
  извне IntelliJ отстаёт, поэтому финальная проверка всё равно `./gradlew build`.
- `execute_sql_query` / `preview_table_data` — реальное состояние схем `auth` и `profile` при отладке
  (напр. `profile.user_message` в онбординге), а не догадки по Flyway-миграциям.
- `get_project_dependencies` / `get_project_modules` — фактический граф модулей от Gradle-импорта.
- `search_symbol` / `get_symbol_info` / `rename_refactoring` — резолв символов и безопасное
  переименование по всему проекту (в отличие от текстового grep).

Правки файлов — обычными Edit/Write (видны в diff), не через `idea`-инструменты.

## Версии: единый источник

Все версии живут **только** в `gradle/libs.versions.toml` — единственный источник правды,
менять версии нужно там. Корневой билд получает каталог `libs` автоматически. Convention-
плагины вынесены в **included build** `module/lib/gradle-plugins` (подключён через
`includeBuild` в `pluginManagement`), и тот же каталог явно прокинут в него через
`from(files("../../../gradle/libs.versions.toml"))` в `gradle-plugins/settings.gradle.kts`.

Внутри precompiled script plugin type-safe accessor `libs` недоступен (gradle/gradle#15383),
поэтому в `io.uliss.kotlin-conventions.gradle.kts` каталог читается рантайм-API
`VersionCatalogsExtension` (`findVersion`/`findLibrary`). Версии BOM-управляемых стартеров
(`spring-boot-starter-*`) в каталог не выносим — их версия и так едина через версию BOM.

## Convention plugins

Общая конфигурация вынесена в included build `module/lib/gradle-plugins` (не дублируется
по модулям):

- `io.uliss.kotlin-conventions` — базовый Kotlin/Spring модуль (библиотека): toolchain,
  `group = io.uliss`, Spring BOM через dependency-management, компиляторные флаги
  (`-Xjsr305=strict`, строгий null-safety, `-Xmulti-dollar-interpolation`), JUnit Platform,
  задача `integrationTest`.
- `io.uliss.spring-boot-app` — наследует `kotlin-conventions` + применяет плагин
  `org.springframework.boot`. Для исполняемых приложений (`auth`, `user-service`).
- `io.uliss.jpa-conventions` — применяет `org.jetbrains.kotlin.plugin.jpa` (no-arg для
  JPA-сущностей). Подключать в модулях с JPA-entity (`auth`, `database`).

Версии build-плагинов (kotlin-gradle-plugin, spring-boot-gradle-plugin и пр.) объявлены
как `[libraries]` в `gradle/libs.versions.toml` и подключаются в
`gradle-plugins/build.gradle.kts` через `implementation(libs.*)`.

## Library auto-configuration & config

Библиотеки самонастраиваются и подключаются приложениями без явного импорта бинов:

- Каждая lib регистрирует свой `*AutoConfiguration` через
  `src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
  (`security`, `database`, `exception`, `logging`).
- Lib кладёт `<module>.yml` (`database.yml`, `exception.yml`, `security.yml`) в свои
  resources, а приложение подключает их в своём `application.yaml` через
  `spring.config.import: classpath:<module>.yml`
  (пример — `module/auth/src/main/resources/application.yaml`).

## Closed decisions (do not revisit)

Финальные решения — не переоткрывать. История — в переписке и per-module `CLAUDE.md`, здесь — сводка
«сюда не лезь»:

- **SPA-токены — в `sessionStorage` браузера; BFF отложён** (нужна общая точка — gateway/Redis, которой пока нет). См.
  `module/lib/security/CLAUDE.md` («SPA token strategy»).
- **Сервис-посредник (`:security` `/oauth2/*`), а не прямой SPA→AS** — SPA не знает адрес auth-сервера; OAuth-клиент
  confidential.
- **`sub` токена = `auth.users.id` (UUID), не email** — стабильный OIDC-subject, без PII.
- **Регистрация — только серверная форма** (`AuthController`); REST `/auth/register` удалён намеренно (пароль не
  попадает в SPA).
- **`displayName` живёт в `user-service`, не в auth** — auth хранит только email+password.
- **Логин блокируется при недоступности user-service** — токен без `userId` неполноценен (осознанный trade-off
  доступности).
- **Split-horizon auth URL** — `AUTH_PUBLIC_URL` (browser-facing) vs `AUTH_INTERNAL_URL` (service-to-service). См.
  `module/lib/security/CLAUDE.md`.
- **Database-per-service** — своя схема на приложение (`auth` → `auth`, `user-service` → `profile`, `note-service` →
  `note`), без общей схемы.
- **`uliss-web` — confidential-клиент, не public** — им пользуется сервис (`:security`), поэтому `refresh_token` grant
  включён намеренно.

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
- No business logic in controllers or repositories — логика в `service`.
- No direct repository calls from controllers.
- No Spring / JPA annotations inside domain classes (hexagonal-lite слои `user-service`).
- No `!!` in Kotlin without a one-line justification comment.
- No version changes outside `gradle/libs.versions.toml` (см. «Версии: единый источник»).
- No Russian in code, comments, logs, or commit messages (см. «Notes»).
- No `TODO`/`FIXME` comments in code — вести в `## Decisions` внутри `docs/CURRENT_TASK.md`.
- Package root — `io.uliss.<module>` (см. «Conventions»).

### Known deviations (to reconcile)

Известный долг — не эталон для нового кода, привести в соответствие при ближайшей правке этих файлов:

- `!!` без обоснования (4 места): `module/lib/security/src/main/kotlin/utils/SecurityUtils.kt:23`
  (реальный риск — `response` может быть null вне request-контекста → заменить на проверку/исключение);
  `module/auth/.../config/DataInitializer.kt:47,72` и `module/auth/.../service/UserService.kt:31`
  (platform-type от `passwordEncoder.encode` — безопасно, дообосновать комментарием).
- Пакет `utils` в `SecurityUtils.kt` вместо `io.uliss.security.utils` — переименовать при рефакторинге.

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
- Persistence: Flyway-миграции + PostgreSQL. Миграции лежат в
  `src/main/resources/db/migration`, именование `V<n>__ddl_*.sql` (есть в `auth` и
  `user-service`). Схема задаётся per-app через `spring.flyway.schemas` /
  `default-schema` + `hibernate.default_schema`.
- JSON: Jackson Kotlin module (`tools.jackson.module:jackson-module-kotlin`).
- Тесты: используют `spring-boot-starter-*-test` стартеры и `kotlin-test-junit5`.
  `failOnNoDiscoveredTests = false` временно включён, пока тестов мало.

## Notes

- `HELP.md` в каждом модуле — автогенерация Spring Initializr (в `.gitignore`), не редактировать.
- При добавлении нового исполняемого сервиса: создать модуль в `module/<name>`, применить
  `id("io.uliss.spring-boot-app")`, прописать `include(...)` и `projectDir` в
  `settings.gradle.kts`.
- При добавлении новой библиотеки: создать модуль в `module/lib/<name>`, применить
  `id("io.uliss.kotlin-conventions")`, аналогично прописать в `settings.gradle.kts`.
- Все комментарии в проекте только на английском. Никаких русских слов в самом проекте использоваться не должно.
  Комментарии используются только в тех местах где необходимо. Сами коментарии по возможности должны содержать минимум
  текста
