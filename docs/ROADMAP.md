# Roadmap

Major milestones on the way to the MVP. Completed milestones carry their completion date; planned milestones are
listed in their intended order, without dates. Domain concepts and rules (constellations, the sky, updates) are in
`DOMAIN.md`; detailed designs of individual items live in `TECH_DEBT.md` and task files.

## MVP

A closed beta for people we know, reachable from the public internet. Registration is by invitation only, so abuse
and cost protection, logging, backups, and monitoring are part of the MVP.

## Done

### Platform — 2026-08-20

Multi-module Gradle build with convention plugins and shared libraries (`database`, `exception`, `logging`,
`monitoring`, `security`, `validation`), library auto-configuration, Docker Compose for the full stack, minikube with
Skaffold, GitHub Actions CI, and JaCoCo coverage reports. Playwright runs in Docker since 2026-09-13.

### Authentication — 2026-07-12

`auth` is an OAuth2/OIDC authorization server with server-rendered sign-in and registration. The SPA uses the
confidential `uliss-web` client through the `:security` mediator: Authorization Code with PKCE, refresh-token rotation,
tokens in `sessionStorage`. Hardened on 2026-10-14: JDBC authorization storage, issuer checks, OAuth state, client
settings synced from configuration.

### Profile and onboarding — 2026-08-07

`user-service` owns profiles and serves `auth` over gRPC (user id and display name in the access token). New users go
through onboarding steps in the SPA after registration.

### Design system — 2026-10-13

`@uliss/design-system`: tokens, fonts, and React components ported from Claude Design, shared by the SPA and the
`auth` templates. Redesign on 2026-09-01; synced with the prototype on 2026-10-13.

### AI chat — 2026-10-08

Persistent chats in `note-service` with SSE streaming of replies, idempotent requests, backward pagination of the
history, a title taken from the first message, Markdown rendering, and rename and delete. Chat turns run under a lease
with fencing (2026-10-14).

### Notes from chats — 2026-10-09

Summarize turns a chat into a note asynchronously through the transactional outbox. Related notes are retrieved with
pgvector embeddings (RAG) as secondary context; the title comes from structured model output. Note status is streamed
over SSE; the SPA has the notes list and note screen.

## Before the MVP

### 1. Chats and notes

- Update the chat's existing note on a repeated Summarize instead of creating a new one.
- Edit a chat message: later messages are removed and the reply is generated again. Design first: edits before the
  summarized boundary, a reply still being generated, deleting versus marking messages, a plain "regenerate".
- Edit notes.
- Create notes manually.
- Start a new chat from a note to expand on its topics; the note is the chat's starting context. Design first: how the
  note reaches the model and where notes produced by that chat are placed (for example, as child notes).
- Notes of a chat: API that links chats and notes, the list in the chat delete dialog, and the context panel sections.
- Account settings backed by `user-service`.

### 2. Chat quality

- Limited web search for checkable facts.
- AI-generated semantic chat titles.
- Address the user by display name in chat and summary prompts.
- User profile from notes: all of the user's notes are compiled into one document about the user (tastes, views,
  recurring themes) that is attached to every chat request next to the system prompt, so the model knows the user
  without searching. Design first: how the profile is built and refreshed as notes change, its size limit, and how it
  stays consistent with the notes search in chat.
- Chat context through its summary: when the chat has a summary note, the model receives the system prompt, the
  note's current text and every message after the summary boundary, always; without a note (or after it was deleted)
  it receives the full history. A turn whose context exceeds 200,000 characters is not created, and the user is asked
  to Summarize. The limit must stay well below the model window, since creating a summary sends the whole chat.

### 3. Constellations

A tree of constellations growing from the user, with any depth. Every note has exactly one parent: a constellation or
another note. The user picks the place before Summarize; one chat can produce several notes. The data model must allow
several constellations per note later (see After the MVP).

### 4. Structured thoughts

Store a note's main and secondary thoughts as data, not only as rendered Markdown. Thoughts are the material for links
between notes.

### 5. Links between notes

Research and design first: how links are found, confirmed, and stored. Then the implementation.

### 6. Updates (basic)

One feed of two kinds of entries: notices for the user (for example, change your password, a background summary
finished) and system proposals to review (move a note to a more precise constellation, link two notes).

### 7. Sky

The graph view: the user in the centre, constellations, and notes as stars, with structural and link edges.

### 8. Search

Search across the user's notes.

### 9. Russian localization

The SPA, the `auth` pages, emails, and the language of AI replies and notes.

### 10. Abuse and cost protection

- Invitation-only registration; users can invite others.
- Daily LLM quotas.
- Rate limiting and brute-force protection at an edge proxy.
- Email verification.
- Password reset.

### 11. Production readiness

- Edge reverse proxy with TLS; service ports are not published.
- Logging without user content; production log levels; Dozzle restricted.
- Database backups with a tested restore.
- Monitoring and alerts: service health and LLM spend.
- Scalable note-status delivery instead of per-connection polling.
- Retention cleanup for terminal outbox events and summary requests.
- Account deletion.
- Production hygiene from `docs/TECH_DEBT.md` (Thymeleaf cache, non-root containers, onboarding backfill) —
  mandatory before the release.

### 12. Product tour

An unobtrusive first-run walkthrough that highlights each area of the app and explains what it is for.

### 13. Closed beta launch

Squash Flyway migrations, deploy to production, and switch migrations to append-only.

## After the MVP

- A note in several constellations at once (multi-tagging), proposed by the system through Updates.
- Sources of a chat reply (to think over; may move before the MVP): the notes found by the chat's notes search are
  shown under the reply and link to the notes. Needs a many-to-many link between an assistant message and notes
  (fragments of one note collapse into one link; removed with the note or the chat).
