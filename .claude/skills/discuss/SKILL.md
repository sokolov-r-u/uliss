---
name: discuss
description: Use when the user brings a new feature, bug or change that needs a task file — the Discussion and Plan steps of the task lifecycle. Spec-driven discussion in Russian, architecture options with trade-offs, EARS acceptance criteria, builder check before the go-ahead.
---

# Spec-driven discussion in uliss

Ideas adapted from Superpowers `brainstorming` v7 (github.com/obra/superpowers, MIT) and the EARS requirement form
used by Kiro. Output is one task file from `docs/TASK_TEMPLATE.md`, plus `docs/TECH_DEBT.md` entries for problems the
user defers; no code is written.

You build what you believe the user wants, and that belief is thinner than it feels. The goal is a task file a
builder could implement without asking anything that changes the result — and the user having seen every
architectural trade-off that matters before saying «го».

## 1. Look before asking

Read the code, tests, the touched modules' `CLAUDE.md`, `README.md`, `DECISIONS.md`, and `docs/DOMAIN.md` /
`docs/ARCHITECTURE.md` where relevant. Ask about intent and trade-offs, never about facts the repo answers.
While reading, note existing problems near the change (coupling, missing tests, a contract that will not hold) —
they go to the user in step 3.

## 2. Understand what and why

- Start with one open question about a concrete moment or picture, not a menu. Open questions go one per message.
- Play back each part as soon as you understand it (what it is for, how one piece behaves), in a few short
  paragraphs. Mark guesses as guesses; only what the user said is theirs. End with "что не так или упущено?".
- Closed choices (two or three known options) go through `AskUserQuestion`, several at once, recommended first.
- The user is strong in Java/Kotlin/Spring and newer to frontend: on web topics explain the option, not only name it.

Territory to cover (a checklist for you, never read it out as a questionnaire):

- behavior, edge cases, error paths and what the user sees for each; empty, loading and error UI states;
- data: schema and migrations in the owning service, existing rows, backward compatibility during deploy;
- contracts between services: REST, gRPC (`user-api`), outbox events — who changes, versioning, old clients;
- transactions, concurrency, idempotency, ordering, retries;
- security: who may see or change what, input validation, secrets, logging of sensitive data;
- performance: N+1, pagination, indexes, payload size;
- observability: logs, metrics, what an incident would need;
- what is explicitly out of scope, and how the user will test the result (normally through the UI).

## 3. Architecture options

For every decision that shapes the code beyond this task — and for every existing problem from step 1 that the
change touches — present it before the plan:

- **Проблема**: what has to be decided and why it matters here.
- **Варианты**: two or three real options (not a straw man), each with плюсы and минусы — complexity, coupling,
  migration cost, testability, operational risk, what it makes harder later.
- **Рекомендация**: your pick and the reason, plus the risk you accept with it.

Ask the user to choose; never present your pick as agreed. Record each fork in the task file's «Архитектурные
варианты». Chosen decisions that matter beyond the task become `DECISIONS.md` entries in the implementation commits.
An existing problem the user does not want fixed now goes to `docs/TECH_DEBT.md`.

## 4. Size the work

- Small change the user explicitly calls small → agree in chat, no task file.
- One testable result → one task file, blocks = commits, each with its tests.
- Several separately testable features → propose an epic (`CLAUDE.md`, Task lifecycle, step 3).

## 5. Write the task file

`docs/tasks/YYYY-MM-DD-<short-name>.md` from the template, in Russian. Acceptance criteria in EARS form, so each
becomes a test:

- «Когда <событие>, <система> должна <реакция>.»
- «Пока <состояние>, <система> должна <реакция>.»
- «Если <ошибка или нежелательное условие>, то <система> должна <реакция>.»
- «<Система> должна <реакция>.» — for always-true rules.

## 6. Builder check

Before asking for «го», dispatch the `builder-check` agent (`.claude/agents/builder-check.md`) with the task file
path. Sort what it returns:

- **already answered** by the discussion or the repo → write the answer into the task file;
- **minor**, a sensible builder settles it without changing the result → decide, mark it «решение Claude»;
- **the user's**, the answer changes what gets built → ask in one message, most important first.

That is the only round of questions the check produces. Then give the user the task file and the list of your own
calls to check.

## Gate

No production code, scaffolding or dependency changes before the user's explicit «го» / «реализуй». Reading,
searching and web research are fine. A change of scope during implementation comes back here.
