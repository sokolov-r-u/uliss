---
name: tdd
description: Use when implementing or fixing behavior in a JVM module (auth, user, note, lib/*) — before writing production code. Red-Green-Refactor for this repo, enforced by .claude/hooks/tdd-gate.sh.
---

# Test-driven development in uliss

Rules adapted from TDD Guard (github.com/nizos/tdd-guard, MIT, `src/validation/prompts/rules.ts`) for Kotlin, Gradle
and this repo's testing rules in `CLAUDE.md`.

## Scope

- Applies to production code under `module/**/src/main/{kotlin,java}` of Gradle modules.
- Does not apply to `module/web` (implement first, tests after the user's UI check — see `module/web/CLAUDE.md`),
  resources, migrations, build files, docs. A migration still gets an integration test that exercises it.
- A bug fix starts with a regression test that reproduces the bug.

## The cycle

1. **Red.** Write one test for the next behavior. Run the narrowest command:
   `./gradlew :<module>:test --tests '<Class>'` or `./gradlew :<module>:integrationTest --tests '<Class>'`.
   - It must fail for the expected reason: an assertion that names the missing behavior. Record the reason in the
     task file's «Прогресс» (one line, e.g. `NoteServiceTest.moves under parent: expected [b], was [a]`).
   - A test that does not compile yet is fine as a first step: create only the missing stub (empty body, constant
     return, new parameter) until the test runs and fails on its assertion. No new logic while reaching red.
2. **Green.** Write the minimal code that makes this test pass. No anticipatory branches, methods, validation or
   error handling that no failing test asks for. Run the same command and see it pass.
3. **Refactor.** Only with the relevant tests green: rename, extract, simplify, add types — in tests and production
   code. A helper whose behavior exists nowhere else is new behavior and needs its own red test. Re-run the tests.

Then pick the next behavior. Prefer many small cycles over one test that drives a whole feature.

## Choosing the test

- Domain and service logic, error paths, edge cases → unit test (`src/test`).
- Repositories, queries, transactions, controllers with validation and error mapping, security chains, gRPC, outbox,
  streaming → integration test (`src/integrationTest`, Testcontainers, real Postgres).
- Parsers, validators, mappers, serialization round trips, invariants (pagination, idempotency, ordering,
  lease/fencing) → property-based test with jqwik.
- Deterministic only: inject `Clock`, use Awaitility instead of `Thread.sleep`, no dependence on test order.
- Assert behavior and contracts. Do not test getters, setters, plain DTOs or plain config. Never mock the class under
  test.

## Violations

- Several new tests at once (restructuring existing tests is fine).
- Production code before a red run of its test, or more code than the failing test needs.
- Changing an expectation to make a test pass, unless the requested behavior intentionally changes the contract —
  then say so in the report.
- `@Disabled`, `skip`, `only`, weakened assertions, deleted tests (also blocked by `content-guard.sh`).

## The hook

`tdd-gate.sh` blocks edits of a module's production code until, in this session, a test of that module was edited
and a Gradle test task of that module failed (`test`, `integrationTest`, or their test compilation). When it blocks,
do the missing step; do not work around it through the shell. When a change truly has no behavior to drive
(a pure refactor started in a new session, generated code), ask the user — only the user switches the rule off with
`touch .claude/tdd-state/off` and back on by deleting that file.
