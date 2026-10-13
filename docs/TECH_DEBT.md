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

**Status:** completed 2026-09-28.

`GET /note/chats/{chatId}/messages` now uses backward keyset pagination over UUID v7 message IDs and
the `(chat_id, id DESC)` index. The SPA loads the latest page, prepends older pages without a scroll
jump, and preserves them during latest-page reconciliation. Full provider history and bounded
summary history remain separate, unpaginated paths. Implementation details and verification are
recorded in `docs/tasks/2026-09-28-chat-message-pagination.md`.

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

## Markdown rendering for AI-generated content (`web`)

**Status:** not implemented. Chat replies and generated note content are currently rendered as
plain text even though an AI provider may return Markdown.

Add a shared frontend Markdown renderer for persisted assistant messages and generated note
content. Raw HTML must remain disabled or be explicitly sanitized; links need safe external-link
handling. Cover headings, paragraphs, lists, emphasis, links, inline code, fenced code blocks, and
malicious input in component tests. Keep the persisted source text unchanged so rendering rules can
evolve without rewriting stored content.

## Record successful summarization in chat history (`note-service`)

**Status:** not implemented. A completed chat summary creates a note, but the source chat does not
receive a visible history entry recording that the summary was created.

After the summary transaction reaches `READY`, persist a chat activity/system message identifying
the created note. The write must be atomic with successful completion and idempotent across outbox
retries, so one summary produces at most one history entry. Decide the new message role/API shape
with the frontend, render it separately from user/assistant dialogue, and exclude it from AI prompt
history and future summary source messages. Failed summary attempts must not claim that a summary
was completed.

## User-centric RAG query for chat summaries (`note-service`)

**Status:** current retrieval works, but its long-chat query can overrepresent verbose assistant
messages. The revised weighting is agreed; implementation is deferred.

`NoteSummaryRequestedHandler.retrievalQuery` currently uses the complete transcript while it fits
the configured limit. For a longer chat it keeps the first two user messages and fills the remaining
budget from the recent conversation regardless of role. Long assistant answers can therefore
dominate the embedding even though the user's intent, constraints, corrections, and preferences are
the primary signals for finding related notes.

Change only the RAG retrieval-query representation, not the authoritative input used to generate
the final note:

- Give roughly 75% of the retrieval-query character budget to meaningful user messages. Preserve
  the initial request, subsequent constraints/corrections, and the most recent user messages before
  less informative acknowledgements or intermediate messages.
- Give the remaining roughly 25% to the last one or two `COMPLETE` assistant responses so retrieval
  still reflects the conversation's current result and terminology. Do not let failed or canceled
  assistant output displace user context.
- Continue sending the complete chat through the captured `throughMessageId` to the summary model.
  Omitting earlier assistant messages from the final prompt would lose explanations, decisions,
  alternatives, and intermediate results needed for a standalone note.
- Strengthen the summary system prompt: prioritize user goals, constraints, corrections, and
  decisions; use assistant messages for explanations and proposed solutions; do not present an
  assistant proposal as a user decision unless the conversation supports that conclusion.
- Keep retrieved notes as untrusted secondary context. The current chat remains authoritative, and
  related-note content must never supply instructions or facts claimed to have occurred in it.

Add deterministic tests for short and over-budget chats, user/assistant budget allocation,
selection of initial/corrective/recent user messages, exclusion of non-complete assistant output,
and preservation of the complete bounded transcript in the final model prompt. A future two-query
approach (user intent plus recent outcome, followed by result fusion and deduplication) may be
evaluated separately if one user-centric embedding does not provide sufficient retrieval quality.

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
  `ChatControllerTest.kt`, `ProfileControllerTest.kt`, `RetryAspectTest.kt`)

### Not in scope for the current task

Recorded as a future cleanup pass — convert the remaining multi-line `//` comments across the
codebase to the KDoc format on a later, dedicated task rather than as a side effect of unrelated
changes.

## Address the user by display name in chat/summary prompts (`note-service`)

**Status:** not implemented, approach unconfirmed. `ChatPrompts.CHAT_SYSTEM_PROMPT` and
`NOTE_SUMMARY_SYSTEM_PROMPT` refer to the user generically ("the user"); no display name is threaded
into either prompt today.

### Observation

The access token already carries an optional `displayName` claim, set by
`TokenConfig.tokenCustomizer` (`module/auth/.../config/TokenConfig.kt`) from a user-service gRPC
lookup performed once at token issuance — the same mechanism that supplies the `userId` claim
note-service already reads via `Jwt.getUserId()` (`module/lib/security/.../JwtExtensions.kt`).
Extracting a `displayName` the same way would not require a new note→user gRPC dependency.

### Open question

The claim is fixed at login time. If a user changes their display name in user-service, note-service
would keep seeing the old value until the next login/token refresh. Decide whether that staleness is
acceptable for chat/summary personalization, or whether personalization instead needs a live
user-service lookup (which would be the larger, cross-service change). The claim is also optional —
onboarding may not have set a display name yet — so any prompt text must fall back gracefully.

### Not in scope for the current task

Recorded while narrowing an unrelated summary-prompt-length change (`module/note/note-app/.../util/ChatPrompts.kt`). No
code changed for this item.

## AI-generated semantic chat title (`note-service`)

**Status:** optional enhancement, not implemented. The backend initial-turn transaction creates the
chat with the whitespace-normalized first non-blank line of the first user message, truncated to 50
Unicode code points with `...` when needed (`TitleNormalizer`). Generated `CHAT_SUMMARY` notes already
get a model title from their structured summary call; this item covers chat titles only. The frontend sends only the
prompt and a request `Idempotency-Key`; it
does not derive or submit a title or chat ID. This is deterministic and adds no provider latency or
failure mode. The request key lets the backend recover both generated identities.

Generating a shorter semantic title with the configured chat provider would require a separate product
decision covering provider cost, failure fallback, and whether the title update is synchronous or
asynchronous. Do not add that provider call incidentally.

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

## Summarize updates the chat's existing note (`note-service`, `web`)

**Status:** designed 2026-10-08 in `docs/features/2026-10-08-summary-update-design.md`; implementation in progress.
The update appends a dated addendum to the chat's latest READY note; RAG retrieval embeds only the new messages and
excludes that note.

Deferred follow-ups agreed during that design:

- **Create a new note on a new topic.** A third Summarize choice next to "Update note": send the messages after the
  boundary plus the current note and ask for a note on the main topic discussed after it. Dropped from the MVP because
  a new chat is the natural path for a new topic and the model cannot reliably avoid near-duplicates. The schema
  allows it later as one more outbox event type and prompt.
- **Notify the user about the outcome of an asynchronous update.** `summary_request.status` records `NOTHING_NEW` and
  `FAILED`, but the chat shows only "Updating the note in the background". Deliver the outcome through the planned
  user notification list.
- **Retention cleanup for `note.summary_request`.** The table only serves idempotency and the in-flight guard; the
  durable boundary lives in `chat_note.summarized_through_message_id`. Delete terminal rows (`APPLIED`, `NOTHING_NEW`,
  `FAILED`) older than the idempotency window; never delete `PENDING` rows.
- **Summary markers in the chat timeline.** Show "Summarized into «note» · date" dividers in the message thread. Render
  them from summary data, not as a new `chat_message` role: a marker written on completion sorts after messages sent
  during generation, so it cannot serve as the boundary. Today only the latest boundary is known to the client.
  Once markers exist and are positioned by `through_message_id`, they can replace the `summary` field of the latest
  message page.

## Design kit copy for chat/note deletion (`uliss-design-system`)

The product deletes a chat without deleting its notes and shows a warning instead of the kit's "Keep / Delete the
notes too" choice; the note delete dialog has no body. The online design's `DeleteChatDialog` and `DeleteNoteDialog`
still show the old copy and should be updated to match. `Dialog.prompt.md` still says every body must name what
survives; the note delete dialog is an agreed exception.

Agreed 2026-10-11 (`docs/tasks/2026-10-11-prot-alignment.md`, item 2): the chat delete dialog lists the notes written
from the chat as buttons. A button opens the note; the note screen then shows a Back button that returns to the URL
carrying the open dialog (e.g. `/chats?delete=<id>`). Notes are never deleted with the chat — the list lets the user
remove what they no longer need by hand. Blocked by `note-service`: no API returns the notes of a chat (`NoteResponse`
has no `chatId`, no `GET /chats/{id}/notes`), although the link is stored. Update the design now; implement in `web`
once the endpoint exists.

The same API unlocks the link sections of the right context panel (item 17): "Notes from this chat" on a chat and
"Written from" on a note. The panel ships frontend-only first (dates, note count, source); add `chatId` (or chat ids)
to `NoteResponse` and `GET /chats/{id}/notes`, then fill both sections and the delete dialog list.

## Chat `updated_at` follows the user's activity (`note-service`)

Agreed 2026-10-12 (`docs/tasks/2026-10-11-prot-alignment.md`). Chat lists in `web` sort and group by last activity
(`updatedAt ?? createdAt`), but `note.chat.updated_at` only moves on a chat-row change (rename): new messages do not
touch it, so an active chat keeps its creation date. Bump `chat.updated_at` when a **user** message is accepted (one
write per turn; the assistant reply does not touch it), and order `GET /chats` by `updated_at DESC` (index
`(user_id, updated_at)`). `web` already sorts client-side, so no frontend change is needed.

## Session drops: refresh token expires or is not used (`auth`, `web`)

Reported 2026-10-12: the user is sent back to sign-in much sooner than the 30-day refresh lifetime. Not yet
diagnosed; suspects, most likely first:

1. **Concurrent refresh with rotation.** `reuseRefreshTokens(false)` rotates the refresh token on every use, but
   `authFetch` (`web/src/auth/apiClient.ts`) has no single-flight refresh. When the 15-minute access token expires,
   parallel requests (e.g. the side panel loads chats and notes at once) each refresh with the same token; the first
   rotates it, the next gets `invalid_grant`, and `refreshOrLogin` clears the tokens and redirects to login.
   **Fixed 2026-10-12:** one in-flight refresh shared by all calls, and a call that hits 401 after another call
   refreshed reuses the stored tokens (`auth/apiClient.test.ts`). If sign-outs continue, check suspect 2.
2. **Stale client token settings.** `DataInitializer` creates the `uliss-web` client once; when the client already
   exists it only adds redirect URIs, so a client row saved before the 15 min / 30 day settings keeps Spring's
   defaults (refresh token 60 min). Check the stored `token_settings` and update them on startup.
3. **`sessionStorage`.** Tokens live per tab and vanish when the tab closes; a new tab or reopened browser always
   signs in again. This is the agreed BFF-deferred convention (`module/web/CLAUDE.md`), so expected, not a bug.

## Manual note creation (`note-service`, `web`)

Agreed 2026-10-11 (`docs/tasks/2026-10-11-prot-alignment.md`, item 9). The design's Notes screen has a "New note"
action (header button on desktop/tablet, top-bar button on the phone). Notes are currently created only by chat
summarization (`source = CHAT_SUMMARY`; the schema already distinguishes manual notes), and there is no create
endpoint. Add `POST /notes` in `note-service`, then the "New note" action and an editor surface in `web`.

## Persist note thoughts as structured data (`note-service`)

**Status:** to think about; no decision. The `CHAT_SUMMARY` model output is structured (`NoteDraft`: main thought plus
up to three secondary thoughts), but the service assembles it into Markdown and stores only `note.content`.

Storing the thoughts separately was deferred because nothing reads them yet (the frontend and RAG indexing use
`content`), the prompt format is still being tuned, and the right shape is unclear: likely a separate thought entity
with links rather than columns on `note`. A manual note would simply be its main thought. Revisit together with the
planned `graph` domain.

## `TextField` counts UTF-16 units, titles count code points (`uliss-design-system`, `web`)

The server title rule is 1–50 code points, but `TextField`'s counter and native `maxLength` count UTF-16 units. The
rename dialog therefore lets a user type only 25 emoji and shows e.g. `60 / 50` for an existing emoji-heavy title,
although Save (which validates code points) stays enabled. Fix by counting code points in `TextField` (and replacing
native `maxLength` with a code-point guard) when emoji-heavy titles matter.

## Limited web search in chat (`note-service`)

**Status:** deferred, waiting on Spring AI. The chat model states unverified specifics as fact (e.g. invented details of
how an album sounds); a limited web search for checkable facts (releases, books, authorship) would let it verify
instead.

Spring AI 2.0's `OpenAiChatModel` uses Chat Completions, which has no built-in web search; OpenAI's built-in
`web_search`
tool (~$10 per 1,000 calls, no extra key) exists only in the Responses API. Options:

- **Preferred once available:** Spring AI support for the OpenAI Responses API or a built-in web search option (as
  `AnthropicWebSearchTool` already exists for Anthropic). Check on each Spring AI upgrade.
- **Fallback:** a provider-neutral `@Tool` backed by Tavily or Brave Search (~$0.005–0.008 per search, about 1,000
  free searches a month); needs a separate API key.
- **Rejected for now:** calling the Responses API directly through the OpenAI SDK, which would bypass `ChatClient`
  and the per-call options, prompt caching, and usage logging built on it.

Whichever path: search only for checkable facts the model is unsure of, not while the user thinks aloud; at most 1–2
searches per turn; pass only the top few short snippets; treat results as untrusted data, like related notes.
Estimated cost is about $0.01 per search including extra `gpt-5.6-luna` tokens; results are not persisted in chat
history, so they do not raise the cost of later turns.

## Squash Flyway migrations before the first production release (`auth`, `user`, `note`)

**Status:** deferred until just before the first production deploy. Until then, keep adding small incremental
migrations; after that deploy, squashing is forbidden and migrations are strictly append-only.

The history has accumulated noise that a fresh production database does not need (state as of 2026-10-08; regroup
against the schema current at squash time):

- Every service has a `V1` that only runs `CREATE SCHEMA IF NOT EXISTS`. It is a no-op: with `spring.flyway.schemas`
  set, Flyway creates the schema itself before `V1` to host `flyway_schema_history`.
- `note`: `ALTER TABLE` column additions (`notes.source` in V4, `notes.title` in V7, `chat.idempotency_key` in V6),
  a single-index migration (V5), and a legacy data fixup (`UPDATE note.chat` title truncation in V7) that is
  meaningless on an empty database. Comments are stale: `chat_note` is called an unused scaffold although
  `NoteService` uses it, and `chat_message` mentions historical rows with `turn_id = NULL`.
- `auth`/`user`: tables split one per file, `create table if not exists` in versioned migrations (hides schema
  drift), mixed keyword case, a missing trailing `;` in auth V4.

Target grouping (15 files → 7), one migration per domain area, ordered by foreign-key dependencies:

- `auth`: `V1__ddl_create_auth_tables` (`users`, `signing_keys`); `V2__ddl_create_spring_authorization_server_tables`
  (kept separate for diffing against the upstream Spring schema on upgrades).
- `note`: `V1__ddl_create_note_tables` (`vector` extension, `notes`); `V2__ddl_create_chat_tables` (`chat`,
  `chat_turn`, `chat_message` with all indexes, `chat_note`); `V3__ddl_create_summary_rag_outbox_tables`.
- `user`: `V1__ddl_create_profile_tables` (`users`, `messages`, `user_message`); `V2__dml_seed_onboarding_messages`.

Procedure:

1. Squash on a branch where no one else changes the schema.
2. Reference snapshot: apply the current migrations to a throwaway database on the same image
   (`pgvector/pgvector:0.8.2-pg18`) and run `pg_dump --schema-only --no-owner --no-privileges -n <schema>
   -T '*.flyway_schema_history'` for `auth`, `profile`, and `note`.
3. Rewrite by hand, not from a dump: fold every `ALTER` into its `CREATE TABLE`, drop data fixups, keep seed DML in a
   separate `dml_` file, refresh comments, restart numbering at `V1`. Keep folded columns at the end of `CREATE` and
   give constraints explicit names so the diff stays clean.
4. Apply the new migrations to a fresh database, dump the same way, and `diff`. The result must be empty or contain
   only consciously accepted differences.
5. Run `:auth:integrationTest`, `:user:integrationTest`, `:note:integrationTest`.
6. Reset every database that has the old history applied (local `infra/volumes/postgres/data`, minikube, any
   staging): Flyway validation fails on checksum mismatch otherwise.
7. Change the migration rule in `module/auth/CLAUDE.md`, `module/note/note-app/CLAUDE.md`, and
   `module/user/user-app/CLAUDE.md` to "append-only after the first production deploy".

Schema improvements noticed along the way stay out of the squash so the diff can prove equivalence. Make them
separately: `(chat_id, created_at, id)` for the `ORDER BY created_at, id` chat-message queries, and CHECK constraints
for `profile.user_message.status` and `profile.users.gender`.
