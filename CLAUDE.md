# Repository instructions

## Before editing

- Inspect the relevant implementation and tests before proposing or writing code. Do not generate changes from
  documentation alone.
- For every touched module, read its closest `CLAUDE.md` and `README.md`. Claude Code auto-loads a subdirectory's
  `CLAUDE.md` once it reads or edits a file there, but do not rely on that alone — open it explicitly before editing.
- For a design-system component, also read its adjacent `<Component>.prompt.md` before using or changing it.
- Treat source code, migrations, manifests, the Gradle wrapper, and the version catalog as authoritative. Documentation
  and ignored task files can be stale.

## Working modes

- The default mode is described below. Manual mode (no commits, 5-file batches, stop after each step) is in
  `docs/WORKFLOW_MANUAL.md`; switch to it only when the user says "ручной режим", back on "обычный режим".

## Task lifecycle

1. **Discussion.** Before any code, ask until the final result and acceptance criteria are unambiguous: behavior,
   edge cases, errors, UI, what is out of scope. Ask in Russian; use the web when it helps. Do not write code yet.
2. **Plan.** Write `docs/tasks/YYYY-MM-DD-<short-name>.md` from `docs/TASK_TEMPLATE.md`, in Russian. Split the work
   into logical blocks; each block is one commit and lists its tests. Skip the file only when the user explicitly says
   to just do a small change.
3. **Split large work.** If the result needs a lot of code and contains several separately testable features, propose
   an epic: `docs/tasks/YYYY-MM-DD-<name>-epic.md` linking child tasks. Start with a simple working version, then add
   complexity in later tasks (separate PRs). Every task must end with something the user can test, normally through
   the UI; backend-only results are tested together with the user via requests.
4. **Start.** Implement only after an explicit go-ahead ("го", "реализуй").
5. **Implement.** Follow the plan block by block with TDD and commit each block (see Commits). Do not stop between
   blocks. Stop and ask only when the plan or a contract must change, a failure is unrelated or repeats without
   progress, a contract would have to be weakened, or the scope grows materially.
6. **Finish.** Run the final verification, the code review (see Subagents), fix confirmed findings, write the report
   into the task file, and give the user a short version of it in the final message (see Final report). The task is
   done only after the user reports the manual test result.

- Do not resume an existing task file merely because its name looks related. First verify its status, base commit, and
  claims against the current branch and code.
- Keep the task file current after each block. Record durable deferred work in `docs/TECH_DEBT.md`, not in source
  TODO/FIXME comments.

## Commits

- Work on the current branch. One commit per logical block, containing the block's code and its tests; the touched
  modules' tests are green at every commit. No commits with failing tests.
- Stage explicit paths, never `git add -A`. Task files are gitignored and never committed.
- Message: `<PREFIX>  - <short imperative summary>` in English, where the prefix is the task type: `DE` defect,
  `FE` feature, `TD` tech debt. End with a blank line and
  `Co-Authored-By: Claude <noreply@anthropic.com>` (use the current model name).
- Never push, amend, revert, reset, rebase, tag, merge, or force anything without explicit per-request permission.

## Testing rules

- Red–Green–Refactor: write the test first, run it and see it fail for the expected reason (record the reason in the
  task file), implement until green, then refactor with the tests still green.
- A bug fix starts with a regression test that reproduces the bug.
- Required layers for changed behavior:
  - unit tests for domain and service logic, including error paths and edge cases;
  - integration tests (`integrationTest`, Testcontainers, real Postgres) for repositories and queries, transactions,
    controllers with validation and error mapping, security chains, gRPC, outbox and streaming;
  - web: Vitest for logic, hooks, and components with behavior; Playwright for changed user flows.
- Property-based tests (jqwik; add it to the version catalog on first use) for parsers, validators, mappers,
  serialization round trips, and invariants such as pagination, idempotency, ordering, and lease/fencing.
  Coverage-guided
  fuzzing (Jazzer) only for parsing untrusted external input, agreed in the plan.
- Tests must be useful: assert behavior and contracts, not that a value passes through unchanged. Do not test getters,
  setters, or `toString` without logic, plain DTOs, or plain config. Non-trivial `toString` (inheritance, masking) is
  tested.
- Tests are deterministic: inject `Clock`, no `Thread.sleep` (use Awaitility), no dependence on execution order.
- Forbidden: `@Disabled`/`skip`/`only`, weakening assertions, deleting tests to make the build pass, mocking the class
  under test. Test expectations may change only when the requested behavior intentionally changes the contract; explain
  it in the report.
- Report JaCoCo line and branch coverage of touched modules; aim for at least 80% on the service layer.
- Diagnose failures and fix issues within the agreed scope. IntelliJ diagnostics are a fast signal when available, never
  the final authority.
- During blocks run the narrowest relevant check. Final verification: `./gradlew build` plus `integrationTest` of every
  touched JVM module; for web changes `typecheck`, `test`, and `build`; for design-system changes its `typecheck`.
- Common commands:
  - `./gradlew :<module>:test`
  - `./gradlew :<module>:integrationTest` (requires Docker/Testcontainers)
  - `./gradlew build`
  - `npm run typecheck -w @uliss/web`
  - `npm run test -w @uliss/web`
  - `npm run build -w @uliss/web`
  - `npm run typecheck -w @uliss/design-system`

## Subagents and skills

- Use subagents for: the code review before the report (`/code-review` on the task's commit range, base commit..HEAD;
  medium effort, high plus `/security-review` for auth/security changes); broad read-only searches across many files
  (`Explore`, a cheaper model such as Sonnet or Haiku); self-contained web research.
- Do not use subagents for implementation, TDD steps, or anything that needs this conversation's context.
- A subagent brief is self-contained. Its output is a claim, not a fact: verify every finding against the code before
  acting, evaluate findings in Russian, and fix only confirmed ones.
- Superpowers: use `test-driven-development`, `verification-before-completion`, and `systematic-debugging`.
  `brainstorming` and `writing-plans` may guide the discussion and plan, but their output goes only into the task file
  in `docs/tasks/` — never `docs/superpowers/`, never committed. Do not use `finishing-a-development-branch` or
  `using-git-worktrees`; use `subagent-driven-development` only when the user asks.

## Final report

Written into the task file; the final message gives the user a short version:

- what was done and the list of commits;
- tests by layer and what they cover, coverage numbers, code-review findings and how they were resolved;
- what was not verified and known risks;
- a manual test checklist: what to start, UI steps, expected result, edge cases worth trying.

## Hard operational limits

These apply in every mode. Obtain explicit per-request permission before crossing any of them:

- Do not run applications: no `bootRun`, service/jar launch, dev server, preview server, or full-stack startup.
- Do not stop processes with `kill`, `pkill`, PID/port termination, or equivalents.
- Do not execute database scripts, migrations, DDL/DML, `psql`, or database writes. Database inspection is read-only and
  only when explicitly requested.
- Do not push or rewrite history (see Commits); commits themselves follow the current mode.
- Do not upload to Claude Design (`/design-sync`) unless the request asks for a sync.
- Tests and read-only build/compile tasks may run without additional permission. Anything else that executes project
  behavior requires permission.

## Engineering conventions

- Method naming: `find*` may return null/empty (absence is a valid outcome); `get*` is guaranteed non-null or throws
  — this applies even to methods returning a `List`.
- Kotlin/Spring: constructor injection only; controllers and repositories stay thin; business logic and transactional
  orchestration belong in services.
- Controllers do not call repositories directly. In the user module, keep Spring/JPA annotations out of
  domain/onboarding command types.
- A `data class` holding secrets (passwords, tokens, keys, client secrets, PKCE verifiers) overrides `toString` to
  omit them; the generated one prints every field into logs and exception messages.
- A secret passed as a parameter of a `@Service` or `@Repository` method (auth codes, OAuth state, tokens, passwords,
  keys) is annotated `@Sensitive` (`io.uliss.logging.annotation`), so `LoggingAspect` masks it in DEBUG call traces.
  Do not rely on the parameter name matching the aspect's fallback regex.
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
  `:uliss-design-system`. `.design-sync/` holds its Claude Design sync inputs; the workflow is in that module's
  `CLAUDE.md`.
- Stable cross-cutting explanations live in `docs/ARCHITECTURE.md`; deployment commands and topology live in
  `docs/DEPLOYMENT.md`; agreed deferred work lives in `docs/TECH_DEBT.md`.
