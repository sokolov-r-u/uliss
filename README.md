# Uliss

Uliss is a multi-module Kotlin/Spring Boot application with a React frontend. It currently provides an OAuth2
authorization server, user onboarding, persistent AI chat, and a shared design system; notes and retrieval-augmented
generation are partially scaffolded.

## Modules

| Gradle/npm module      | Directory                        | Purpose                                                                       |
|------------------------|----------------------------------|-------------------------------------------------------------------------------|
| `:auth`                | `module/auth`                    | OAuth2/OIDC authorization server and server-rendered login/registration UI    |
| `:user`                | `module/user/user-app`           | User profiles, onboarding REST API, and internal gRPC API                     |
| `:user-api`            | `module/user/user-api`           | Protobuf/gRPC contract shared with auth                                       |
| `:note`                | `module/note/note-app`           | Persistent chats, SSE responses, one-shot AI requests, and future RAG storage |
| `@uliss/web`           | `module/web`                     | React/Vite SPA                                                                |
| `:security`            | `module/lib/security`            | Shared resource-server configuration and OAuth mediator                       |
| `:database`            | `module/lib/database`            | Shared JPA, Flyway, auditing, and entity infrastructure                       |
| `:exception`           | `module/lib/exception`           | Error handling and optimistic-lock retry support                              |
| `:logging`             | `module/lib/logging`             | Shared structured/AOP logging                                                 |
| `:monitoring`          | `module/lib/monitoring`          | Shared actuator configuration                                                 |
| `:validation`          | `module/lib/validation`          | Shared Bean Validation constraints                                            |
| `:uliss-design-system` | `module/lib/uliss-design-system` | CSS tokens, fonts, React components, and auth static resources                |

The definitive Gradle mapping is in `settings.gradle.kts`. Dependency and toolchain versions live in
`gradle/libs.versions.toml`; the Gradle version comes from `gradle/wrapper/gradle-wrapper.properties`.

## Architecture

JVM applications broadly use thin transport adapters, service-layer business logic and transaction boundaries, and
repository persistence. User onboarding uses a hexagonal-lite command model. Libraries register Spring Boot
auto-configuration and are imported by applications through module YAML configuration.

Important established decisions:

- OAuth authorization is mediated by the shared `:security` library; the SPA does not know the authorization-server
  address.
- The confidential `uliss-web` client uses Authorization Code, PKCE, refresh-token rotation, and browser
  `sessionStorage`. A stateful BFF is deferred.
- The OIDC subject is the stable auth-user UUID rather than email.
- Registration is an authorization-server form; profile data belongs to user-service.
- Authentication intentionally depends on user-service enrichment for user tokens.
- Public and internal authorization-server URLs are separate configuration values.
- Each service owns its PostgreSQL schema.

See `docs/ARCHITECTURE.md` for shared build and auto-configuration mechanics. Module READMEs contain the detailed
runtime contracts.

## Build and verification

Requirements are the JDK selected by the version catalog, system Node/npm, and Docker for Testcontainers or container
workflows. Machine-specific Gradle properties are copied from `gradle.properties.example`.

```bash
./gradlew build
./gradlew :auth:test
./gradlew :auth:integrationTest
./gradlew jacocoRootReport
npm install
npm run build -w @uliss/web
npm run typecheck -w @uliss/design-system
```

`jacocoRootReport` merges available unit and integration-test execution data. Integration tests use PostgreSQL through
Testcontainers and require a running Docker daemon.

## Local and container environments

Applications are configured through environment variables. `infra/env.example.properties` documents the expected values,
while actual local values belong in the ignored `infra/.env`.

PostgreSQL and the optional full-stack Docker Compose profile are defined in `infra/docker-compose.yml`.
Kubernetes/minikube manifests live under `infra/k8s` and are orchestrated by `skaffold.yaml`. See `docs/DEPLOYMENT.md`
for the supported commands, routing, image build, and GHCR publishing flow.

Repository automation rules for Codex are in `AGENTS.md`. Deferred engineering work is tracked in `docs/TECH_DEBT.md`.
