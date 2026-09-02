# Repository instructions

## Before editing

- Inspect the relevant implementation and tests before proposing or writing code. Do not generate changes from
  documentation alone.
- For every touched module, read its closest `AGENTS.md` and `README.md`. When working from the repository root, nested
  instructions are not assumed to be loaded automatically.
- During the migration from Claude Code, a module that does not yet have `AGENTS.md`/`README.md` still uses its existing
  `CLAUDE.md` as temporary reference material. Remove this fallback when the migration is complete.
- For a design-system component, also read its adjacent `<Component>.prompt.md` before using or changing it.
- Treat source code, migrations, manifests, the Gradle wrapper, and the version catalog as authoritative. Documentation
  and ignored task files can be stale.

## Workflow and checkpoints

- A task is long-running when it is expected to change at least 7 tracked files, span sessions, touch 3 or more modules,
  change a database schema, or change a public/inter-service contract.
- For long-running work, create `docs/tasks/YYYY-MM-DD-<short-name>.md` from `docs/TASK_TEMPLATE.md` before
  implementation. Task files are local and gitignored.
- Do not resume an existing task file merely because its name looks related. First verify its status, base commit, and
  claims against the current branch and code.
- Change at most 7 unique version-controlled files in one autonomous batch. New files count; repeated edits to the same
  file do not. The ignored task journal and generated build/cache files do not count.
- After changing and checking the seventh file, stop with a diff and verification summary for user review. Start a new
  count after approval. Tasks changing at most 6 files need no routine checkpoint.
- Keep the task file current after each coherent batch. Record durable deferred work in `docs/TECH_DEBT.md`, not in
  source TODO/FIXME comments.

## Verification

- Add or update tests for changed behavior when testable. Do not delete or weaken tests merely to make the build pass.
- Test expectations may change only when the requested behavior intentionally changes the contract; explain that change.
- Diagnose failures and fix issues within the agreed scope. Stop when a failure is unrelated, repeats without progress,
  requires weakening a contract, or materially expands scope.
- Prefer the narrowest relevant check, then run the broader module check when risk warrants it. IntelliJ diagnostics are
  a fast signal when available, never the final authority.
- Common commands:
    - `./gradlew :<module>:test`
    - `./gradlew :<module>:integrationTest` (requires Docker/Testcontainers)
    - `./gradlew build`
    - `npm run typecheck -w @uliss/web`
    - `npm run build -w @uliss/web`
    - `npm run typecheck -w @uliss/design-system`

## Hard operational limits

Obtain explicit per-request permission before crossing any of these limits:

- Do not run applications: no `bootRun`, service/jar launch, dev server, preview server, or full-stack startup.
- Do not stop processes with `kill`, `pkill`, PID/port termination, or equivalents.
- Do not execute database scripts, migrations, DDL/DML, `psql`, or database writes. Database inspection is read-only and
  only when explicitly requested.
- Do not create commits, push, or rewrite history: no `git commit`, `push`, `revert`, `reset`, `rebase`, `tag`, or
  `merge`. Read-only Git and staging are allowed.
- Tests and read-only build/compile tasks may run without additional permission. Anything else that executes project
  behavior requires permission.

## Engineering conventions

- Kotlin/Spring: constructor injection only; controllers and repositories stay thin; business logic and transactional
  orchestration belong in services.
- Controllers do not call repositories directly. In the user module, keep Spring/JPA annotations out of
  domain/onboarding command types.
- Avoid Kotlin `!!`; if platform nullability makes it provably safe, add a short justification or remove the ambiguity.
- Versions live in `gradle/libs.versions.toml`; BOM-managed dependency versions are not duplicated in module builds.
- Package roots use `io.uliss.<module>`. Comments, code, logs, and commit messages are English-only and concise.
- Preserve current architecture decisions by default. Change them only when the user explicitly scopes the task to that
  decision.
- Each executable service owns its database schema. User and note REST controllers receive their service prefix through
  `WebMvcPathPrefixConfig`; do not duplicate the prefix on individual controllers.

## Project map

- Applications: `module/auth`, `module/user/user-app` (`:user`), `module/note/note-app` (`:note`), and `module/web`.
- Shared JVM libraries: `database`, `exception`, `logging`, `monitoring`, `security`, and `validation` under
  `module/lib`; gRPC contracts are in `module/user/user-api`.
- The design system in `module/lib/uliss-design-system` is both npm package `@uliss/design-system` and Gradle module
  `:uliss-design-system`.
- Stable cross-cutting explanations live in `docs/ARCHITECTURE.md`; deployment commands and topology live in
  `docs/DEPLOYMENT.md`; agreed deferred work lives in `docs/TECH_DEBT.md`.

