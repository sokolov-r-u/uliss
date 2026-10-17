# Tech debt / deferred work

A list of known tech debt and agreed-upon future work, deliberately deferred — not forgotten, but
recorded here until implementation.

## Chat list pagination (`note-service`)

**Status:** not implemented. `GET /note/chats` returns every chat of the user, ordered by last activity
(`updated_at DESC, id DESC`, already indexed). Add keyset pagination over that order, with the SPA side nav and chat
list loading further pages, once chat counts make the full list slow.

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
- `module/note/note-app/.../model/ChatMessageStatus.kt`
- assorted test files (`MockitoTestHelpers.kt` in both `note-app` and `user-app`,
  `ChatControllerTest.kt`, `ProfileControllerTest.kt`)

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
  Account has no editable fields (`user-service` has no profile read endpoint yet), Language is
  English-only (no i18n layer). Build these out with their backing features.
- **Design-system card / specimen pages not ported.** Claude Design ships `*.card.html`
  specimens and `_ds_bundle.js`; the repo has no committed equivalent. Wave 2 left an
  uncommitted esbuild harness (`_specimen-components.{html,js,src.tsx}`) for a one-off browser
  eyeball only — delete after review. A `guidelines/` or Storybook-like surface is out of scope
  for this program.

## Summarize updates the chat's existing note (`note-service`, `web`)

**Status:** implemented 2026-10-15 (see `module/note/note-app/DECISIONS.md`). The update appends a dated addendum to
the chat's latest READY note; RAG retrieval embeds only the new messages and excludes that note.

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
- **Summarize stays hidden after a failed create until the next message or reload.** The SPA moves the boundary
  locally when a request is accepted; if that create then fails, the server has no current note but the chip stays
  hidden on the open page. Track the accepted note's terminal status (or refetch on failure) to show it again.
- **V9 backfill of concurrent creates.** Older duplicate `PENDING` requests are marked `FAILED`; if their note still
  completes, its boundary stays null and a later update re-reads the whole chat. Only affects chats that had two
  in-flight creates at deploy time.

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

0. **In-memory authorization store** (explains drops after an auth restart only, not the 15-minute drops of a
   running app). `auth` had no `OAuth2AuthorizationService` bean, so Spring used
   `InMemoryOAuth2AuthorizationService`: every auth restart or deploy invalidated all refresh tokens. **Fixed
   2026-10-14:** JDBC authorization and consent services in `AuthServerConfig`.

1. **Concurrent refresh with rotation.** `reuseRefreshTokens(false)` rotates the refresh token on every use, but
   `authFetch` (`web/src/auth/apiClient.ts`) has no single-flight refresh. When the 15-minute access token expires,
   parallel requests (e.g. the side panel loads chats and notes at once) each refresh with the same token; the first
   rotates it, the next gets `invalid_grant`, and `refreshOrLogin` clears the tokens and redirects to login.
   **Fixed 2026-10-12:** one in-flight refresh shared by all calls, and a call that hits 401 after another call
   refreshed reuses the stored tokens (`auth/apiClient.test.ts`). 2026-10-14: `getAccessToken()` is the single
   owner of the session, and only a 400/401 refresh rejection signs the user out; network/5xx failures keep the
   tokens. Duplicated tabs still share one copied refresh token (needs shared storage plus Web Locks). If
   sign-outs continue, check suspect 2.
2. **Stale client token settings.** `DataInitializer` creates the `uliss-web` client once; when the client already
   exists it only adds redirect URIs, so a client row saved before the 15 min / 30 day settings keeps Spring's
   defaults (refresh token 60 min). Check the stored `token_settings` and update them on startup.
   **Fixed 2026-10-14:** startup syncs secret, client/token settings and exact callback URLs from config.
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
- `note`: `ALTER TABLE` column additions (`notes.source` in V4, `notes.title` in V7, `chat.idempotency_key` in V6,
  `outbox_event.lease_id` in V8),
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

## Daily LLM quotas for users without a subscription (`note-service`, `user`, `auth`, `web`)

**Status:** agreed direction 2026-10-14, not implemented. Any registered user can call the chat and summary endpoints
without limit, and every call is paid to OpenAI.

- Enforce in note-service, the only caller of the provider. Start with daily counts of new chat turns and summary
  requests; a token budget (usage is already logged in `AssistantService.logUsage`) can follow, since long chats cost
  more per turn.
- Table `note.usage_daily (user_id, day, chat_turns, summaries)`, day in UTC. Increment with a single conditional
  upsert (`... SET chat_turns = chat_turns + 1 WHERE chat_turns < :limit RETURNING`) inside the turn-reservation
  transaction (`ChatTurnService.resolveTurnRequest`), so concurrent tabs cannot exceed the limit and idempotent
  replays, which create no new turn, spend nothing.
- The plan lives in user-service and reaches note-service as a `plan` access-token claim added by
  `TokenConfig.tokenCustomizer` (like `displayName`); a change applies at the next refresh. Limits per plan are
  note-service configuration.
- Over the limit: `429 Too Many Requests`, code `QUOTA_EXCEEDED`, `Retry-After` until the next UTC midnight; `web`
  shows the remaining allowance and a clear message.
- Long-running task (schema, token contract, 3+ modules): create a `docs/tasks/` file first.

## Rate limiting and brute-force protection (`infra`, `auth`)

**Status:** not implemented. Login and registration accept unlimited attempts. Production runs on Docker Compose,
not Kubernetes, so Ingress annotations do not apply.

- In Compose, `auth` is published directly on `:9000`; only `/user` and `/note` pass through the `web` nginx. Put an
  edge reverse proxy in front of every published service (extend the `web` nginx with an `auth` server block, or a
  dedicated edge container that also terminates TLS) and stop publishing service ports to the host.
- Per-IP limits there with nginx `limit_req_zone $binary_remote_addr ...` / `limit_req`: strict on `POST /login` and
  `POST /register` (a few requests per minute with a small burst), looser on `/user/oauth2/*` and `/note/*`.
  Behind another proxy, restore the client address with `real_ip_header` / `set_real_ip_from`.
- Later, per-account protection in `auth`: count failures from `AuthenticationFailureBadCredentialsEvent` per email
  and lock sign-in temporarily after N failures, which also covers attempts spread over many IPs.

## Email verification at registration (`auth`, `infra`)

**Status:** planned, not implemented. Users are created as `PENDING_VERIFICATION`, but nothing verifies the address
and `UserEntity.toUserDetails` blocks only `DISABLED`, so unverified users sign in.

- Send mail over SMTP with `spring-boot-starter-mail`; the provider is configuration only (`spring.mail.*`).
- Development and tests: a Mailpit container in `infra/docker-compose.yml` (SMTP plus a web inbox), no provider,
  domain, or limits.
- Real users: a transactional provider on a free tier (Amazon SES, Mailgun, Resend, Brevo, SendGrid); compare
  current free limits before launch. Self-hosting an MTA was rejected: cloud and residential IPs often block outbound
  port 25 or are on block lists, a new IP has no reputation, and SPF/DKIM/DMARC/PTR plus queue and bounce handling
  must be maintained. Either way the own domain needs SPF and DKIM records.
- Flow: registration stores a random verification token (hash only, 24-hour TTL) and mails a `/verify?token=...`
  link; opening it sets `ACTIVE`; sign-in is refused until then; resending the link is rate-limited.

## Chat-turn lease is derived from settings the OpenAI client ignores (`note-service`)

`ChatTurnExecutionPolicy` computes the chat-turn lease from `spring.http.clients` (connect + read timeout) and
`spring.ai.retry.max-attempts`. Since Spring AI 2.0 the OpenAI chat model runs on the `openai-java` SDK, which uses
`spring.ai.openai[.chat].timeout` / `max-retries` (and its own backoff) and no `RetryTemplate`; those Spring settings
only matter for the inactive DeepSeek provider. The lease is currently long enough by coincidence and silently stops
following real timeouts when either side changes. `OutboxLeasePolicy` was moved to the SDK settings on 2026-10-14.

Rebase the chat-turn lease on the same resolved OpenAI settings, sharing the budget calculation with
`OutboxLeasePolicy`. First verify how the SDK request timeout applies to a streamed response: it may cap the whole
stream, not a single read.

## Chat reply generation stops when the user leaves the chat (`note-service`, `web`)

**Status:** known issue, reported 2026-10-15; not implemented.

Steps: send a chat message, leave the chat while the reply streams, come back. The reply is cut at the moment of
leaving and stays `PARTIAL` ("interrupted"), or empty `FAILED` if no token had arrived yet. The full reply is never
generated or saved.

Cause: `AssistantService.streamNewGeneration` wraps the provider stream in `Flux.usingWhen` subscribed only by the SSE
client. A client disconnect fires `onCancel`, which cancels the provider call and persists the buffered text with
`interruptedStatus(reply)`. `ChatMessageStatus.PARTIAL` documents client disconnect as an intended cause, so the fix
changes the contract.

Direction to discuss:

- Run generation as a server-side job detached from the HTTP subscriber; SSE clients only observe it.
- Only an explicit `cancelTurn` (`CANCELED`) stops generation; a disconnect does not.
- On return to a chat whose turn is `GENERATING`, reattach to the running generation (reuse `pending` /
  `GenerationPending` and the turn lease/fencing) and continue streaming.
- Decide how a turn interrupted by a service restart reaches a terminal status (lease expiry).
- SSE semantics and the meaning of `PARTIAL` change, so `web` needs synchronized changes and tests.

## Rework logging before production (all JVM services, `infra`)

**Status:** deferred until the move to production; nothing changed on 2026-10-15 (pre-production only).

`LoggingAspect` traces every `@Service`/`@Repository` call at DEBUG with arguments and results, and
`infra/env.example.properties` sets `LOG_LEVEL_ULISS=debug`. Secrets are masked (`@Sensitive` plus a name regex), but
user content is not: chat prompts and replies, note content and email addresses reach stdout, `infra/volumes/logs`
and Dozzle. Dozzle is published on `8888` on all interfaces without authentication.

Before production:

- User prompts and other user content must never be logged. Decide between disabling argument/result tracing for
  content-carrying methods and an explicit allowlist of loggable types; keep `@Sensitive` for secrets.
- Default `LOG_LEVEL_ULISS` to `info` in production configuration.
- Restrict Dozzle (bind to `127.0.0.1` or put it behind authentication) or drop it from the production Compose file.

## Registered clients missing from config stay active (`auth`)

**Status:** not implemented (pre-existing; found in the 2026-10-15 review).

`DataInitializer` rebuilds only the two configured clients (`app.clients.authorization-code`, `app.clients.m2m`).
A client whose id was renamed or removed from config keeps its row in `oauth2_registered_client` with its old secret,
grants and redirect URIs and can still obtain tokens. Decide whether startup should delete, disable (e.g. expire the
secret) or only warn about unknown clients; deleting needs care because `oauth2_authorization` rows reference them.

## Abandon an outbox worker once its lease is lost (`note-service`)

**Status:** not implemented (agreed 2026-10-15 to defer).

A summary worker that outlives its lease keeps its executor slot and keeps paying for the provider call, although its
result is dropped (`module/note/note-app/DECISIONS.md`). The OpenAI SDK honours a server `Retry-After` without an upper
bound, so provider timeouts alone cannot bound the wait. Run the handler with a deadline equal to its lease and
interrupt the provider call when it passes (or check the lease before each provider call).

## Production hygiene before the first release (`auth`, `user`, `infra`)

**Status:** not implemented (review item №29, recorded 2026-10-16). **Mandatory before the first production
release** (ROADMAP, Production readiness).

- `spring.thymeleaf.cache: false` in `module/auth/src/main/resources/application.yaml` is a dev setting that ships to
  production: every login/registration page is re-parsed. Make it `true` by default and disable it only in dev
  configuration. The source TODO stays until this is done.
- Onboarding messages added by a later migration are not assigned to existing users (TODO in
  `module/user/user-app/.../service/MessageService.kt`). Decide between a backfill migration and lazy assignment when
  pending messages are read.
- All containers run as root: the JVM images (`infra/docker/base-jre`, jib `io.uliss.docker-conventions`) set no
  user, and `module/web` uses `nginx:alpine` on port 80. Set a non-root `container.user` in jib and switch web to an
  unprivileged nginx image on a high port (Compose and k8s port mappings change with it).
- `infra/k8s/*/deployment.yaml` have no readiness/liveness probes and no resource requests/limits. Production runs on
  Docker Compose, so this matters only if k8s becomes a target platform; Compose healthchecks already exist.

## Split the chat page state machine (`web`)

**Status:** not implemented (review item №27).

`module/web/src/chat/ChatPage.tsx` is ~750 lines with ~20 `useRef`s; the generation state is an implicit state machine
spread across refs. Move it into a reducer or a `useChatTurn` hook with explicit transitions (idle → streaming →
settling → …) that is testable without rendering.

## Paginate chat and note lists (`note-service`, `web`)

**Status:** not implemented (review item №28).

`GET /note/chats` and `GET /note/notes` return every row, and list items carry the full note `content`. Add keyset
pagination and a lightweight list DTO; the side navigation and list pages load more on demand. API contract change.

## Security headers in the `web` nginx (`web`, `infra`)

**Status:** not implemented (review item №9, deferred 2026-10-16).

`module/web/nginx.conf.template` sends no `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` or
`frame-ancestors`, although access and refresh tokens live in `sessionStorage`, where an injected script can read them.
Development serves the SPA from Vite, so only the `web` container (Compose profile `full`, production) is affected.
Do it together with the edge reverse proxy (see "Rate limiting and brute-force protection"). Start with
`Content-Security-Policy-Report-Only`, check fonts, SSE and the auth redirects in a browser, then enforce.

## Signing key encryption and rotation (`auth`)

**Status:** not implemented (review item №9, deferred 2026-10-16).

`auth.signing_keys` stores the JWT signing private key in plain text, and one key lives forever. Encrypt the key at
rest with a key from the environment, and rotate: publish the next key in the JWKS before signing with it, keep the old
one until the longest-lived token signed with it expires.

## Separate database users and secrets per service (`infra`)

**Status:** not implemented (review item №9, deferred 2026-10-16).

All services connect as `postgres` and share one `.env` / Secret with every key. Give each service its own database
user limited to its schema (Flyway runs as the schema owner) and only the secrets it needs.

## Stop provider generation on an explicit cancel (`note-service`)

**Status:** not implemented (review item №15, deferred 2026-10-16).

`cancelTurn` marks the turn `CANCELED` in the database, but a stream opened in another tab or instance keeps reading
from OpenAI and the tokens are paid. Options discussed: an in-memory registry of provider subscriptions per instance
(cancels local streams only) or a cross-instance signal through the database that the streaming attempt polls. Solve
together with "Chat reply generation stops when the user leaves the chat", which moves generation off the SSE
subscriber.

## Chat replies through the OpenAI Responses API (`note-service`)

**Status:** waiting for Spring AI 2.1 GA (deferred 2026-10-16; RC1 of Spring AI 2.1 and Spring Boot 4.2 is due
2026-10-22, GA dates are not announced).

Since the notes search tool (`docs/tasks/2026-10-16-chat-notes-search.md`), chat replies send a function tool, and
OpenAI's `/v1/chat/completions` rejects function tools on gpt-5.6 models unless `reasoning_effort` is `none` (400:
"Function tools with reasoning_effort are not supported ... use /v1/responses"). Spring AI 2.0's `OpenAiChatModel`
supports only Chat Completions, so `note.assistant.reasoning-effort` is `none` for now (it was `low`).

Spring AI 2.1 adds `OpenAiResponsesChatModel` (`spring.ai.openai.chat.api=responses`); `ToolCallingAdvisor` still runs
the tool loop, so `AssistantService` and `NotesSearchTool` stay. It requires Spring Boot 4.2. When both are GA:
- upgrade Spring Boot (all services) and Spring AI, switch to `chat.api=responses`, and set chat replies back to a
  reasoning effort (`low`);
- move the per-call options (`reasoningEffort`, `verbosity`, `promptCacheKey`) to the Responses options in
  `AssistantService`, `NoteSummaryRequestedHandler`, and `NoteSummaryUpdateRequestedHandler`; check that structured
  output (`.entity()` with `useProviderStructuredOutput()`) still works for summaries;
- re-check `ChatTurnExecutionPolicy` and `OutboxLeasePolicy`, which derive leases from `spring.ai.openai.*` timeouts
  and retries, and the usage log (cached tokens) in `AssistantService`;
- not chosen: Spring AI 2.1.0-M1 on Spring Boot 4.2 milestones now, or our own `ChatModel` over `openai-java`'s
  Responses API (throwaway once 2.1 is GA).

## Guard unsaved note edits against in-app navigation (`web`)

**Status:** not implemented. Note edit mode warns on tab close (`beforeunload`) and asks before Cancel, but leaving
through an in-app link (side navigation, another note) drops unsaved edits silently.

react-router's `useBlocker` works only under a data router, and the SPA uses `BrowserRouter`. Moving to
`createBrowserRouter` (route objects, loaders unused) and blocking navigation while `NoteEditForm` is dirty closes the
gap; the same guard would serve the later AI-assisted edit. Recorded from `docs/tasks/2026-10-17-note-manual-edit.md`.

