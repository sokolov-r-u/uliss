# Architecture decisions: note-service

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-14 — Outbox claims are fenced by a lease id

- **Decision:** every claim counts as an attempt and issues a new `leaseId`; `complete`/`recordFailure` apply only
  while the lease still matches. An expired claim that used the last attempt is failed (with its terminal handler)
  instead of being handed out again. Leases derive from the OpenAI SDK settings (`spring.ai.openai.*`).
- **Consequences:** domain writes made by a handler are not fenced; a handler must check the domain state itself.
- **Source:** commits `0903875`, `5cb5ec4`.

## 2026-10-15 — An instance claims only event types it can handle

- **Context:** with attempts counted per claim, an instance without a handler for a type (rolling deploy) burned the
  attempts of that type's events until they failed.
- **Decision:** `OutboxService.claim()` filters by the types of the registered `OutboxHandler`s (injected with
  `@Lazy` to break the OutboxService → service → handler → OutboxService cycle).
- **Source:** commit `578468f`.

## 2026-10-15 — Assistant replies without text are not history

- **Decision:** one predicate, `ChatMessageEntity.isEmptyAssistantReply()` (assistant role, blank content), removes
  such replies from the provider chat history and from the summary retrieval query. The summary prompt itself still
  sees every message with its status.
- **Source:** commits `f1de74d`, `55da254`.

## 2026-10-14 — The note status stream is bounded

- **Decision:** the stream sends SSE comment heartbeats and closes after 10 minutes; the SPA re-reads the note and
  reconnects while it is generating (`module/web/DECISIONS.md`).
- **Source:** commits `bbfc872`, `77a398b`.

## 2026-10-15 — A summary that outlives its lease is dropped

- **Context:** the outbox fails a note when the last attempt's lease expires, while that worker may still be waiting
  for the provider (the OpenAI SDK honours any server `Retry-After` without an upper bound). Accepting the late
  result (commit `d57c929`) produced duplicate notes when the user had already requested a new summary.
- **Decision:** replaces "accept a late chat summary for a failed note" (`d57c929`, `6b5cba8`): late is late.
  `completeChatSummary` saves only into a GENERATING note. To keep the wait short, the summary lease is bounded to
  6 minutes (chat `max-retries: 2`, embedding `timeout: 30s` → ≈ 5.2 min), checked by a test of the shipped
  `application.yaml`.
- **Consequences:** a slow summary costs its tokens and ends FAILED; the user requests a new one. Chat turns get one
  provider retry less; embedding calls (indexing, RAG search) time out after 30 s. A worker past its lease is not
  interrupted (`docs/TECH_DEBT.md`).
- **Source:** `docs/tasks/2026-10-15-review-fixes.md`.


## 2026-10-15 — Summarize requests carry a status; one in flight per chat

- **Context:** a later Summarize appends to the chat's existing note, so one note gets many requests and the note
  status no longer describes a request.
- **Decision:** `summary_request.status` (`PENDING`, `APPLIED`, `NOTHING_NEW`, `FAILED`) replaces the unique
  `note_id`. A partial unique index allows one `PENDING` request per chat; a second one is 409
  `SUMMARY_IN_PROGRESS`. `chat_note.summarized_through_message_id` is the durable boundary of what a note covers;
  deleting the boundary message nulls it (the whole chat counts as unsummarized) instead of dropping the link.
- **Consequences:** `summary_request` stays short-lived idempotency and in-flight state; nothing durable reads it.
- **Source:** `docs/tasks/2026-10-08-summary-update.md`.

## 2026-10-15 — A later Summarize appends a dated addendum to the current note

- **Decision:** the current note is the chat's latest `READY` `CHAT_SUMMARY` note. `UPDATE` reads only the messages
  after its boundary, embeds only them for RAG and excludes the note itself from the search, and gets a
  `NoteAddendumDraft` (no title). The backend, not the model, appends `---` and a `## yyyy-MM-dd` (UTC) heading.
  `applyChatSummaryUpdate` first moves the request out of `PENDING` with a conditional update, so a redelivered or
  late event never appends twice; a concurrent rename fails the transaction on the note version and the outbox
  retries. Creating a second note from the same chat is deferred (`docs/TECH_DEBT.md`).
- **Consequences:** the latest message page carries `summary`; the SPA hides Summarize when the latest message is the
  boundary. `NOTHING_NEW` and `FAILED` outcomes are not shown to the user yet.
- **Source:** `docs/tasks/2026-10-08-summary-update.md`.

## 2026-10-16 — Outbox retries are jittered

- **Context:** events that fail together (a provider outage) were all rescheduled to the same moment and retried as one
  burst.
- **Decision:** `OutboxBackoff` keeps the 30 s doubling step capped at 30 min and spreads each delay by ±20%; the cap
  stays a hard upper bound.
- **Source:** `docs/tasks/2026-10-16-code-quality-cleanup.md`.

## 2026-10-16 — A running summary update is visible on the note

- **Context:** a note stays `READY` while its update runs, so an opened note page showed the old content and never
  learned about the addendum.
- **Decision:** note and status responses carry `updating`: the note is `READY` and has a `PENDING` summary request.
  The status stream treats `READY` as terminal only when `updating` is false; the request state stays in
  `summary_request`, no new note status.
- **Source:** `docs/tasks/2026-10-16-note-update-live-refresh.md`.

## 2026-10-16 — Full model exchanges are logged at DEBUG

- **Context:** prompts are still being tuned, but the logs held only the user's text, truncated by call tracing; the
  assembled request (system prompt, history, RAG chunks) and the raw response were never logged.
- **Decision:** the shared `ChatClient` gets Spring AI's `SimpleLoggerAdvisor` as a default advisor; its logger level
  is `LOG_LEVEL_AI` (default `info`). Requests and responses are logged whole, user content included.
- **Consequences:** at DEBUG every chat turn and summary writes its full context to the log; keep `info` in
  production.
- **Source:** task `docs/tasks/2026-10-16-log-cleanup.md`.

## 2026-10-16 — The chat model searches the user's notes through a tool

- **Context:** chat replies did not know the user's notes; RAG was used only by Summarize.
- **Decision:** the model gets a per-turn `searchNotes(query)` tool (OpenAI function calling through Spring AI's
  `ToolCallingAdvisor`) instead of a search before every message, so it searches only when needed and writes its own
  query. `ChatFacade` passes `AssistantService` a `NoteSearch` bound to the user that leaves out the chat's current
  summary note, so the chat domain does not call note services. Limits: top-5, similarity 0.70, 3 searches per turn.
  A failed search is returned to the model as text. Each search extends the attempt's lease to `now + lease`
  (fenced by attempt, never shortened) instead of a lease sized for the worst case of every search, which would make a
  retry after a crash wait about 20 minutes. Search progress is the new SSE event `activity`
  (`SEARCHING_NOTES` / `THINKING`), not persisted and not replayed.
- **Consequences:** a turn makes one more model call per search; found fragments are not in the saved history, so a
  later turn searches again. OpenAI's hosted `file_search` is not used: notes stay in our pgvector.
- **Source:** task `docs/tasks/2026-10-16-chat-notes-search.md`.

## 2026-10-16 — The notes search tool bounds the tool-calling loop

- **Context:** refines "The chat model searches the user's notes through a tool": the 3-search limit only refused
  searches, while Spring AI's `ToolCallingAdvisor` has no iteration cap, so a model that kept calling the tool kept
  making paid model calls.
- **Decision:** every call counts (blank queries too); the first call over the limit is refused with text, the next one
  throws `NotesSearchAbortedException`, which ends the turn. It is a checked exception on purpose: Spring AI returns
  runtime tool failures to the model but rethrows other causes. A search whose lease extension reports a lost fence ends
  the turn the same way; a lease-extension error is reported to the model as "search unavailable".
- **Consequences:** a turn makes at most `max-calls-per-turn + 2` model calls; an aborted turn ends `FAILED` or
  `PARTIAL` like a provider error.
- **Source:** task `docs/tasks/2026-10-16-chat-notes-search.md` (code review).

## 2026-10-16 — Chat replies run without reasoning until the Responses API

- **Context:** with the `searchNotes` tool, gpt-5.6 on `/v1/chat/completions` answers 400 unless `reasoning_effort` is
  `none`; Spring AI 2.0 has no Responses API model.
- **Decision:** `note.assistant.reasoning-effort` is `none` (was `low`); summaries keep `medium`, since they send no
  tools. Moving chat replies to `OpenAiResponsesChatModel` waits for Spring AI 2.1 GA (`docs/TECH_DEBT.md`).
- **Source:** task `docs/tasks/2026-10-16-chat-notes-search.md`.

## 2026-10-16 — RAG similarity thresholds measured on real notes

- **Context:** every RAG search returned nothing, in chat and in Summarize: `min-similarity` was 0.70 for both. With
  `text-embedding-3-small`, pairwise cosine similarity of one user's 12 indexed notes measured 0.46-0.69 for notes on
  the same topic (music) and 0.27-0.45 across topics (music vs. anime and film); no pair reached 0.70.
- **Decision:** Summarize (`note.summary.retrieval-min-similarity`) uses 0.50: its query is a transcript, so it compares
  like note-to-note text. The chat notes search (`note.assistant.notes-search.min-similarity`) uses 0.30: a short query
  scores lower than a note, so the floor only drops unrelated text and top-5 plus the model choose what is relevant.
- **Consequences:** the sample is small and mostly one topic; re-measure when users have more and more varied notes.
- **Source:** task `docs/tasks/2026-10-16-chat-notes-search.md` (manual test: 0 chunks for a Bowie query while a
  Bowie note was indexed).

## 2026-10-16 — Summaries keep every thought worth remembering

- **Context:** a note allowed at most three secondary thoughts ("fewer is better", and the backend dropped the rest).
  Re-summarizing a long chat about two albums kept only the final comparison and lost several of the user's distinct
  views.
- **Decision:** no fixed limit on secondary thoughts, for new notes and addenda; nothing is dropped in code. The main
  thought is the line the whole chat followed; a secondary thought must still matter without the chat (a distinct
  opinion, conclusion, preference, decision, or intention), not a passing remark or a detail of the main thought.
- **Consequences:** notes from long chats get longer; the "would still matter without this chat" filter is what keeps
  them from becoming a per-message retelling.
- **Source:** task `docs/tasks/2026-10-16-chat-notes-search.md` (manual test of a re-summarized Bowie chat).

## 2026-10-17 — Versioned full-note edits

- **Context:** users edit a note's title and Markdown content by hand; a repeated Summarize appends to the same note
  and another tab may save in between.
- **Decision:** `PUT /note/notes/{noteId}` replaces title and content and carries the `@Version` value the edit
  started from (`NoteResponse.version`). A mismatch, or a concurrent commit caught on flush, is
  `409 NOTE_VERSION_CONFLICT`; an edit is refused with `409 NOTE_UPDATING` while a summary update is pending, because
  that update was drafted from the content the edit replaces. Content is capped at 100,000 characters. A summary
  update applied after an edit appends to the edited content.
- **Source:** task `docs/tasks/2026-10-17-note-manual-edit.md`, block 1.

## 2026-10-17 — Chat activity is `chat.updated_at`

- **Context:** chat lists must show the most recently active chat first; `updated_at` changed only on rename, and the
  server ordered by `created_at`.
- **Decision:** `chat.updated_at` is the chat's last activity. A rename (JPA last-modified date), a new user message
  (in the turn-reservation transaction) and a new Summarize request (create or update) set it; replays of the same
  idempotency key do not. `touchActivity` leaves `version` alone so concurrent JPA writes are not rejected.
  `GET /note/chats` orders by `updated_at DESC, id DESC` (index `idx_chat_user_id_updated_at`); V10 backfills it from
  the latest message.
- **Source:** task `docs/tasks/2026-10-17-chat-activity-order.md`, block 1.

## 2026-10-17 — Model rewrites of a note are streamed drafts

- **Context:** task 2 of the note-editing epic: the user edits a note with a typed command to the model; the result
  must be reviewable and revertible before anything is stored.
- **Decision:** `POST /note/notes/{noteId}/ai-edit` takes the command and the text as the editor holds it (unsaved
  edits included), checks only that the note is the user's, `READY` and not updating, and streams the model's
  Markdown as SSE `append` → `done` / `error`. Nothing is persisted and no outbox is used: the user waits for the
  result, and saving stays the versioned `PUT`. Plain streamed text, not structured output, so tokens can be shown as
  they come; the system prompt asks for the whole note only and marks the note text as data. The model gets no RAG,
  history or tools, and never the title. Limits: command 1–1,000 and text 1–30,000 characters. Options
  `note.ai-edit`: reasoning `low`, verbosity `medium` (low verbosity invites shortening the note).
- **Consequences:** a version conflict surfaces only on Save; the model may still add a preface or a code fence,
  which the prompt alone guards against.
- **Source:** task `docs/tasks/2026-10-17-note-ai-edit.md`, block 1.
