# Tech debt / deferred work

A list of known tech debt and agreed-upon future work, deliberately deferred — not forgotten, but
recorded here until implementation.

## Kotlin null assertions and package alignment

**Status:** known deviations; reconcile when the affected code is next changed.

- `module/lib/security/src/main/kotlin/utils/SecurityUtils.kt` uses `!!` for the current servlet
  response. The response can be absent outside a request context; replace the assertion with an
  explicit check and failure, and move the file into `io.uliss.security.utils`.
- `DataInitializer` has two `passwordEncoder.encode(...)!!` calls and `UserService` has one. These
  are Kotlin platform types from the encoder API; either remove the ambiguity or document the
  proven non-null boundary locally when those files are next changed.

New Kotlin code must not copy these deviations.

## JaCoCo coverage gate

**Status:** reporting exists; enforcement is deferred.

`jacocoTestReport` and `jacocoRootReport` generate coverage reports, but
`jacocoTestCoverageVerification` has no threshold and the build does not fail on low coverage. Add
an enforced threshold only after the test suite is broad enough for the chosen number to be a
meaningful regression gate rather than an arbitrary target.

## Chat message history pagination (`note-service`)

**Status:** not implemented. Designed and agreed upon; implementation deferred to a separate task.

### Problem

`ChatService.getMessages(userId, chatId)` (`module/note/note-app/.../service/ChatService.kt`)
currently returns the **entire** message history of a chat in one list
(`chatMessageRepository.findByChatIdOrderByCreatedAtAsc(chatId)`). For long chats this is an
unbounded response — reading history needs pagination.

Not to be confused with `appendUserMessage` in the same service: it uses the same repository method to
assemble the **full** history sent to DeepSeek on every turn — that must stay unpaginated. Pagination
only applies to the read endpoint `getMessages` / `GET /chats/{chatId}/messages`.

### Chosen approach: cursor-based (keyset) pagination by message `id`

Both offset-based (`Pageable`/`page`+`size`) and cursor-based options were considered. **Cursor-based**
was chosen:

- `ChatMessageEntity.id` is a time-based UUID (`UuidEntity`, `Generators.timeBasedEpochGenerator()`),
  monotonically increasing together with `created_at` and unique (PK) — a ready-made cursor with no
  extra tie-break field needed.
- Offset (`LIMIT`/`OFFSET`) in an actively growing chat causes shifted/duplicated rows between page
  requests when new messages are inserted in between (the normal case for a chat, where the assistant
  keeps appending to history) — the cursor-based approach is not affected by this, since the cursor is
  a specific row (`id`), not a position in the list.
- The existing index `idx_chat_message_chat_id_created_at (chat_id, created_at)`
  (`V3__ddl_create_chat_tables.sql`) already covers filtering by `chat_id`; no extra migration is
  required to start. If filtering by `id < :cursor` on top of this index turns out to be insufficiently
  fast under real load — add a dedicated `(chat_id, id)` index.

### Backend (what needs to be implemented)

- `ChatMessageRepository` (currently `CrudRepository`): add derived-query methods for reading a "page"
  of a chat's messages — older than a cursor, only `before: UUID?` + `limit`, e.g.
  `findByChatIdAndIdLessThanOrderByIdDesc(chatId, cursor, pageable)` for loading older messages, plus a
  separate method with no cursor for the first (most recent) page.
- `ChatService.getMessages` — the signature needs `limit: Int` and an optional `before: UUID?`
  (cursor = `id` of the oldest message already loaded on the frontend), keep the existing chat-ownership
  check (`requireOwnedChat`), return the page in chronological order (ASC) for display.
- `ChatController.getMessages` (`GET /chats/{chatId}/messages`) — add query parameters `limit`
  (required or with a sensible default, e.g. 50) and `before` (optional; absent = latest page/most
  recent messages).
- Response shape — a metadata envelope instead of a flat `List<ChatMessageResponse>`: needs a field
  telling the client whether there are more older messages (`hasMore`), and/or a cursor for the next
  request (`nextCursor`), so the frontend doesn't have to guess the end of history from a partial page.
  The exact DTO shape is an implementation detail; this semantics must be preserved.

### Frontend (what needs to be implemented symmetrically)

- The chat screen must fetch messages page by page: on chat open — no `before` (latest `limit`
  messages), on scroll-up to the top of the list — with `before = id` of the oldest message already
  rendered; loaded messages are prepended to the **start** of the list.
- The frontend decides and sends `limit` (page size / how many messages to fetch at a time).
- Keep per-chat pagination state: cursor of the oldest loaded message + the `hasMore` flag from the
  backend response; stop fetching once `hasMore = false`.
- Changing the response shape of `GET /chats/{chatId}/messages` (envelope instead of a flat list) is a
  breaking contract change — backend and frontend must be updated together, in the same task.

### Not in scope for the current task

Recorded as a future plan — implementation (backend + frontend) is a separate task.

## Retention/cleanup job for terminal outbox events (`note-service`)

**Status:** not implemented. Nothing currently deletes rows from `note.outbox_event` — `COMPLETED`
and `FAILED` events accumulate in the table forever.

### Problem

`OutboxService`/`OutboxPoller` (`module/note/note-app/.../outbox/`) only ever transition events
between `PENDING`/`PROCESSING`/`COMPLETED`/`FAILED` — there's no job that removes (or archives) rows
once they reach a terminal status (`COMPLETED`, `FAILED`). Under sustained traffic this table grows
unbounded, which eventually affects `findClaimable`'s index scan (`idx_outbox_event_status_next_attempt`)
and general table/index bloat.

Noted while discussing `OutboxService.recordFailure`'s "event no longer exists" guard: today that
branch is unreachable (nothing deletes rows), but a retention job would be the first real path to it.

### Not in scope for the current task

Recorded as a future task — design and implement a scheduled cleanup (e.g. delete `COMPLETED`/`FAILED`
rows older than some retention window) as a separate piece of work; needs a decision on retention
period and whether terminal events should be deleted outright or archived first.

## Scalable note-status delivery (`note-service`)

**Status:** current per-connection database polling is acceptable for the initial rollout; replace
it after measuring real concurrency.

### Problem

`NoteService.streamNoteStatus` currently opens an independent polling loop for every active SSE
connection. Each loop reads the ownership-filtered note row once per second until it reaches
`READY` or `FAILED`. This keeps PostgreSQL as the source of truth and works across application
instances, but database load grows linearly with the number of users viewing generating notes.

### Candidate approaches

- Add a per-instance batch poller that collects the IDs of all locally observed notes and loads
  their statuses with one bounded `WHERE id IN (...)` query per interval. This preserves the current
  database-based correctness model without introducing new infrastructure.
- Publish committed status changes through Redis and forward them to local SSE subscribers. Redis
  lowers delivery latency and removes frequent PostgreSQL reads, but plain Pub/Sub is not durable.
  The implementation must therefore retain an initial database read and either a low-frequency
  safety poll or another recovery mechanism for missed notifications. Publishing should happen
  after the note transaction commits; strict delivery guarantees may reuse the outbox.

### Not in scope for the current task

Keep the one-second per-connection polling implementation for the initial release. Choose between
batch polling and Redis using observed concurrent SSE connections, database load, deployment
topology, and whether Redis is already part of the production infrastructure.

## Comment style migration to the new KDoc rule (project-wide)

**Status:** not implemented. New rule adopted in `CLAUDE.md` ("Notes") going forward; existing
comments predating the rule were not retrofitted, except in the outbox-related files touched while
the rule was introduced (`module/note/note-app/.../outbox/*`, `module/lib/database/.../outbox/*`).

### Problem

Per `CLAUDE.md`, any comment longer than one line must be KDoc (`/** ... */`) directly above the
declaration it documents, not a multi-line `//` block; a KDoc covering 2+ distinct cases/branches
should use a bold-label paragraph per case (see `OutboxPoller.poll()` for the pattern) instead of a
dense paragraph or a dash-bullet list. Multi-line `//` blocks predating this rule still exist
throughout the codebase, e.g. (non-exhaustive):

- `module/lib/database/.../audit/AuditorAwareImpl.kt`
- `module/lib/security/.../config/AuditorConfig.kt`
- `module/note/note-app/.../config/WebMvcPathPrefixConfig.kt`
- `module/note/note-app/.../model/ChatMessageStatus.kt`
- `module/user/user-app/.../config/WebMvcPathPrefixConfig.kt`
- assorted test files (`MockitoTestHelpers.kt` in both `note-app` and `user-app`,
  `ChatControllerTest.kt`, `AskControllerTest.kt`, `ProfileControllerTest.kt`,
  `RetryAspectTest.kt`)

### Not in scope for the current task

Recorded as a future cleanup pass — convert the remaining multi-line `//` comments across the
codebase to the KDoc format on a later, dedicated task rather than as a side effect of unrelated
changes.

## AI-generated chat title on first message (`note-service`)

**Status:** not implemented. `ChatService.createChat` (`module/note/note-app/.../service/ChatService.kt:24`)
always falls back to the hardcoded `DEFAULT_CHAT_TITLE = "New chat"` when the client doesn't pass a
`title` (`CreateChatRequest.title` is optional, `module/note/note-app/.../dto/CreateChatRequest.kt`).

### Problem

When a chat is created together with its first message, the neural network should also come up with a
short, meaningful chat title derived from that message, instead of leaving every chat named "New chat"
(or requiring the client to invent one). This needs a separate call/prompt to the AI provider
(DeepSeek) to generate the title — analogous to how ChatGPT/Claude-style products title conversations
from the first user message.

### Not in scope for the current task

Recorded as a future plan — implementation (backend, and frontend if the title needs to appear/update
asynchronously in the chat list) is a separate task.

## Design system — deferred items (`:uliss-design-system`)

Opened 2026-08-31 during the design-system integration refresh
(`docs/tasks/2026-08-31-design-system-integration.md`).

- **Extended Latin subset.** Fonts ship Latin + Cyrillic only. `latin-ext` (Polish, Czech,
  Turkish, Romanian, … diacritics) is not bundled. Add the `latin-ext` `@font-face` blocks +
  `.woff2` (Google `css2` output) when a non-English/Russian locale is added. No local
  subsetter is available — pull the pre-subset files from `fonts.gstatic.com`.
- ~~**`src/react` components on the old design system.**~~ Closed by wave 2 (2026-08-31):
  the banner-era primitives are deleted and the 32 Claude Design components are ported to
  `.tsx` under `src/react/components/<group>/` with a `.prompt.md` each and an `export *`
  barrel. `module/web` still imports the barrel's `Wordmark` / `Kicker` — props shifted, so
  those call sites reconcile in waves 3–4.
- ~~**Consumer screens reference dead tokens.**~~ Closed 2026-08-31 by waves 3–11 — `module/web`
  and `module/auth/.../templates` are rebuilt on the new tokens; the integration refresh is
  complete on `FE-design`.
- **Backend-less product screens ship as empty states.** `/notes`, `/constellations`, `/sky`,
  `/updates`, `/search` (waves 7–10) render only a DS `EmptyState` — there is no notes list,
  tag tree, graph renderer, updates log or search backend. When those land, attach the populated
  state to the existing `ui/Screen.tsx` shells (don't fabricate mock data). Same for the Notice
  mechanism's `useNotice().confirm` (DS `Dialog`) — wired but has no caller until a
  delete/summarise action exists.
- **Settings: Sky / Account / Language are static.** Only Settings › Appearance
  (`ui/theme.ts`) is functional. Sky settings show inert controls (no renderer to drive),
  Account has no editable fields (`user-service` `GET /users/me` returns a stub), Language is
  English-only (no i18n layer). Build these out with their backing features.
- **Design-system card / specimen pages not ported.** Claude Design ships `*.card.html`
  specimens and `_ds_bundle.js`; the repo has no committed equivalent. Wave 2 left an
  uncommitted esbuild harness (`_specimen-components.{html,js,src.tsx}`) for a one-off browser
  eyeball only — delete after review. A `guidelines/` or Storybook-like surface is out of scope
  for this program.
