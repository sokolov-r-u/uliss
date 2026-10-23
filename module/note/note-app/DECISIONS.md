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

## 2026-10-17 — Dictation is transcribed through note-service

- **Context:** voice input in every chat composer (chat, new chat, note edit command); the key and the per-user
  control must stay on the server.
- **Decision:** the browser records one file and posts it to `POST /note/speech/transcriptions`; note-service checks
  the declared type against a whitelist and the container signature (WebM, Ogg, MP4), the size against
  `note.speech.max-file-size`, and calls Spring AI's auto-configured `OpenAiAudioTranscriptionModel`
  (`gpt-4o-transcribe`), naming the file by its container so the provider picks the decoder. The recording length is
  a config value (`note.speech.max-duration`, 5 minutes) that the browser reads from `GET /note/speech/settings` and
  enforces; the server never decodes, stores or logs audio. No language is passed. A provider failure is
  `502 TRANSCRIPTION_FAILED` with no server retry: the user retries the kept recording.
- **Consequences:** the server limits only bytes, not seconds; truncation of long files by `gpt-4o-transcribe` is
  checked by hand and answered by lowering the config value. The multipart limit (11 MB) is a backstop above the
  service limit, and nginx allows 12 MB bodies under `/note/`.
- **Source:** task `docs/tasks/2026-10-17-voice-input.md`, block 1.

## 2026-10-18 — Constellations are their own tree table; the epic's schema lands at once

- **Context:** the constellations epic needs a tree of places, multi-membership of notes with one main, and sub-notes.
- **Decision:** V11 creates `note.constellations` (a tree via `parent_id`), `note.note_constellation` and
  `notes.parent_note_id` together; the last two are unused until later tasks. Constellations are not notes with a
  type: notes carry status, versions, RAG, outbox and chats that a shared table would have to filter everywhere.
  Composite FKs on `(id, user_id)` keep parents and memberships within one user. A root stores `hue` (0–359) and no
  `lightness`; a sub-constellation stores a `lightness` step (`DEEP`, `BASE`, `LIGHT`, `PALE`) and inherits the root's
  hue; a `CHECK` on `parent_id IS NULL` enforces it. Names are unique regardless of case among roots and among
  siblings through one unique index `(user_id, parent_id, lower(name)) NULLS NOT DISTINCT`. Memberships cascade with
  the note but not with the constellation: the service moves or drops them. A branch is deleted with a recursive CTE.
- **Consequences:** existing notes stay without a place; nothing is backfilled.
- **Source:** task `docs/tasks/2026-10-18-constellations-tree.md`, block 1.

## 2026-10-18 — Constellation tree rules live in `ConstellationService` under a per-user lock

- **Decision:** names are trimmed with whitespace runs collapsed, 1–40 code points. A new root takes the palette tone
  least used by the user's roots (earliest on a tie); a new sub-constellation is `LIGHT` right under a root and `PALE`
  deeper. A root moved under another node drops its hue and takes the default lightness of its new depth; a
  sub-constellation made a root keeps the hue it inherited; other moves keep the lightness. A move into the own branch
  is `409 CONSTELLATION_MOVE_CYCLE`, a taken name `409 CONSTELLATION_NAME_TAKEN`. Every change takes a transactional
  advisory lock on the user (`pg_advisory_xact_lock`) and checks against a fresh snapshot of the whole tree: two
  moves checked separately could close a cycle that the schema cannot see.
- **Consequences:** one user's tree changes are serialized; reads take no lock. The tree is loaded whole per change,
  which assumes trees of hundreds of nodes, not millions.
- **Source:** task `docs/tasks/2026-10-18-constellations-tree.md`, block 2.

## 2026-10-19 — Note memberships are replaced as a whole set by pure placement rules

- **Context:** task 2 of the constellations epic puts notes into constellations: one main among several memberships.
- **Decision:** `NotePlacement` holds the rules as pure functions over one note's memberships: the first constellation
  becomes main, a removed main promotes the oldest remaining membership (earliest `added_at`, then the smallest id), a
  deleted branch drops its memberships and moves a note that had no other place to the chosen target as main.
  `NoteConstellationStore` (`JdbcTemplate`) writes a changed note by deleting all its rows and inserting the new set:
  JPA would flush the new main's update before the old main's delete and trip the one-main partial index. Tree counts
  come from one recursive query: distinct notes per subtree and per node itself.
- **Source:** task `docs/tasks/2026-10-19-constellations-notes.md`, block 1.

## 2026-10-19 — Note places change under the tree lock; deleting a branch moves only notes that need it

- **Decision:** `NotePlacementService` adds, removes and promotes memberships under the same per-user advisory lock as
  tree changes, so a membership cannot race the deletion of its branch and two first additions cannot both become
  main. A note with `parent_note_id` refuses memberships (`409 NOTE_PLACE_INHERITED`). Any note status may be placed.
  `ConstellationService.delete` takes an optional target: in one transaction it drops the branch's memberships
  (promoting a main where one was lost), moves notes placed only inside the branch to the target as main (or leaves them
  without a place), and deletes the branch. The target must be the user's and outside the branch (`404` / `400`).
  `getDeletionImpact` counts the notes that need the move.
- **Source:** task `docs/tasks/2026-10-19-constellations-notes.md`, block 2.

## 2026-10-19 — A note has one place per line of the tree

- **Context:** after the manual test of task 2 the user wants a note in Jazz or in Music, never in both, while Jazz and
  Rock side by side stay allowed.
- **Decision:** `NotePlacement` takes the tree's `isAncestor` relation. Adding or promoting a constellation replaces
  the note's places on the same line, keeping their main flag. A branch move runs `keepDeepest` over the notes of the
  moved branch: the ancestor place goes, a lost main passes to the oldest remaining descendant place. The checks use
  the tree snapshot already loaded under the lock. `V12` applies the same rule once to existing memberships.
- **Source:** task `docs/tasks/2026-10-19-constellations-notes.md`, block 5.

## 2026-10-19 — A summary note is placed together with its summarize request

- **Context:** task 3 of the constellations epic lets the user pick the constellation of a chat's first summary note
  before generation, which runs asynchronously through the outbox.
- **Decision:** `SummarizeRequest.constellationId` (CREATE only, `400` with UPDATE) is applied by
  `NoteService.requestChatSummary` through `NotePlacementService.add`, in the transaction that creates the `GENERATING`
  note, its `summary_request` and the outbox event. The choice is not carried in the payload or applied on `READY`: the
  user, not the model, chose the place, the note shows in the branch at once, and branch deletion already handles
  memberships of notes in any status. A failed generation keeps its place; the next Summarize is CREATE again. A
  replayed key returns the original note before any check and never changes its place, also when a concurrent
  duplicate loses the reservation. A missing or foreign constellation rolls the whole request back with
  `404 CONSTELLATION_NOT_FOUND`, now the code of every placement change, so the client tells it from a missing chat.
- **Source:** task `docs/tasks/2026-10-19-constellations-summarize.md`, block 1.

## 2026-10-19 — Sub-notes live where their top note lives; the hierarchy is read whole

- **Context:** task 4 of the constellations epic nests notes under notes at any depth (`notes.parent_note_id` from
  V11); a sub-note has no memberships of its own.
- **Decision:** `NoteHierarchy` holds the rules as pure functions over a snapshot of the user's notes (id, parent,
  title, age) that `NoteHierarchyStore` reads in one query: ancestors, subtree, the top note whose place a sub-note
  inherits, the cycle check (a note never moves under itself or its descendant) and the title search for the picker.
  Tree counts treat a sub-note as placed wherever its top note is placed (a recursive CTE with `UNION`, so even
  corrupted cyclic data terminates); `ownNoteCount` includes the sub-notes of the node's own notes. "Notes here" and
  "Without constellation" return the place's notes with all their descendants, and `NoteResponse.parentNoteId` lets
  the client nest them. A subtree is deleted in one statement, so the parent FK (no cascade) is checked at its end.
- **Consequences:** like the constellation tree, the hierarchy is loaded whole per change or search, which assumes
  thousands of notes per user, not millions.
- **Source:** task `docs/tasks/2026-10-19-constellations-subnotes.md`, block 1.

## 2026-10-19 — Moving notes under notes, and deleting a parent with a choice

- **Decision:** `NoteHierarchyService` changes parent links under the user's tree lock, the same lock as
  constellations and memberships, against a fresh snapshot: two opposite moves cannot close a cycle and a parent
  cannot be deleted under a new sub-note. `PUT /notes/{id}/parent` drops the note's own memberships;
  `DELETE /notes/{id}/parent?moveTo=` ("Move out") makes `moveTo` the only, main place or leaves the note without one,
  and does nothing for a top note, so a retry is harmless. A cycle is `409 NOTE_MOVE_CYCLE`; a missing parent is
  `404 PARENT_NOTE_NOT_FOUND`, a code of its own so the client tells it from the missing note. Summarize takes
  `parentNoteId` as an alternative to `constellationId` (both: `400`) and hangs the `GENERATING` note in the request's
  transaction, like a constellation. Deleting a note with sub-notes needs `?subNotes=KEEP|DELETE`; without it
  `409 NOTE_HAS_SUB_NOTES`, so a sub-note created after the dialog opened is never lost silently. `KEEP` moves the
  direct sub-notes to the note's parent, or makes them top notes with a copy of its memberships with their joining
  times, so later promotions follow the same order (`NoteRemoval.keepSubNotes`). `DELETE` removes the whole subtree in
  one statement; FK cascades take chat links, summary requests, memberships and RAG chunks, and chats stay.
- **Consequences:** deleting a note moved from `NoteService` to `NoteHierarchyService`. The picker's note search is
  server-side over the same snapshot (up to 20 hits, prefix matches first), each hit with its path.
- **Source:** task `docs/tasks/2026-10-19-constellations-subnotes.md`, block 2.

## 2026-10-20 — The sky is one snapshot

- **Context:** the Sky screen draws the whole constellation tree and every note at once; reading them through the
  existing endpoints would take a request per constellation and could mix two moments.
- **Decision:** `GET /sky` returns the tree and the stars in one read-only `REPEATABLE_READ` transaction. `SkyStore`
  reads all notes of the user (no text) and all memberships in two queries; `SkyNotes` decides the stars as a pure
  function: only `READY` titled notes are stars, a star hangs under its nearest star ancestor, and a star with no star
  above it carries its top note's memberships, so a note being written never hides its sub-notes or their place.
- **Consequences:** the client builds the sky without further requests and fetches a note's text only when a star is
  opened. Like the trees, the snapshot is loaded whole, which assumes thousands of notes per user.
- **Source:** task `docs/tasks/2026-10-20-sky.md`, block 1.

## 2026-10-21 — An abandoned turn does not block its chat; chat streams send heartbeats

- **Context:** a turn whose lease expired (the service restarted mid-stream) could be resumed or failed only by a
  request with its own idempotency key. A client that had lost the key got 409 for every new message until the chat
  was deleted. The chat reply stream had no heartbeat, unlike ai-edit and status streams.
- **Decision:** when a new turn finds another `GENERATING` turn with an expired lease, that turn becomes `FAILED`
  with an empty `FAILED` assistant message (fenced like the attempt-limit path) and the new turn starts; a live lease
  still answers 409. Chat reply streams use `withHeartbeat`; the interval of all SSE heartbeats is
  `note.sse.heartbeat-interval` (default 15 s).
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 10.

## 2026-10-21 — Note indexing is serialized per note and never goes back in time

- **Context:** index events of one note (a rename, then an edit) could run in parallel; the slower one, holding the
  older text, overwrote the newer index, and parallel replaces collided on the chunk unique key.
- **Decision:** the handler passes the note version it read; `JdbcRagChunkStore.replace` takes a per-note advisory
  lock and drops an index whose version is older than the stored index's `rag_chunks.content_version`. The stored
  index, not the note, is the reference, so a note changed since without new text keeps its index.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 11.

## 2026-10-21 — Constellation note counts are aggregated in memory

- **Context:** the counting query paired every constellation with each of its ancestors in a recursive CTE, so its
  rows grew with the square of the tree depth, on every tree and sky view; no limit bounds the depth.
- **Decision:** `countNotes` reads two flat lists (constellation parents, placed notes with sub-notes) and
  `ConstellationNoteCounter` walks each placement up its ancestors in memory, stopping where the note is already
  counted. `note_constellation` gets an index on `(user_id, constellation_id)`. Tree size limits stay undecided
  (`docs/TECH_DEBT.md`, "Constellation tree size limits").
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 12.

## 2026-10-21 — Note status streams read a projection and are limited per user

- **Context:** every open status stream loaded the whole note (content included) each second, and a user could open
  any number of them against an 8-connection pool.
- **Decision:** `NoteStatusService` (split out of `NoteService`) polls `findStatusByIdAndUserId` (id, status,
  `updated_at`) and refuses a stream beyond `note.status-stream.max-per-user` (default 5) with 429
  `TOO_MANY_STATUS_STREAMS`; a slot is freed when the stream ends, fails or is cancelled. The count is per instance.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 13.

## 2026-10-21 — Chat-note links carry their owner; renames follow the edit rules

- **Decision:** `chat_note` gets `user_id` with composite foreign keys to `chat (id, user_id)` and
  `notes (id, user_id)`, like the other cross-table references; the migration drops links across users (none can be
  created by code). A rename is refused while a summary update is pending and maps a lost concurrent write to the
  version conflict, as an edit does. A summary addendum that would grow a note past 100,000 characters fails the
  request instead of making the note uneditable. `OutboxService` reads time from an injected `Clock`.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 14.

## 2026-10-21 — Unfixable outbox failures fail the event at once

- **Context:** summary handlers called their terminal failure handler themselves, outside a transaction, and then
  returned normally, so the event ended `COMPLETED`; a summary whose note was deleted still paid for a model call.
- **Decision:** a handler throws `NonRetryableOutboxException`; `OutboxService.recordFailure` fails the event on that
  attempt and runs the terminal handler in its transaction. The summary handler skips a note that no longer waits
  for its summary before any provider call.
- **Source:** task `docs/tasks/2026-10-21-code-review-fixes.md`, block 14.

## 2026-10-22 — Summary prompts see the note's place

- **Decision:** both summary prompts (create and update) carry a `NOTE PLACE` block after the chat: the full name
  path of every constellation of the note's top note, main first, and its parent notes from the top down, or
  "none — the user has not applied any tags yet". The worker reads it through
  `NoteHierarchyService.getPlaceDescription` when it runs, not at request time, because the note may move while the
  event waits. The system prompt tells the model to use the place for understanding and never mention it.
- **Source:** task `docs/tasks/2026-10-22-summary-place-title.md`, blocks 1–2.

## 2026-10-22 — The user may name a new summary note

- **Decision:** `SummarizeRequest.title` (CREATE only, `UPDATE` with a title is 400) follows the rename rule (≤ 50
  code points, whitespace collapsed; blank means none, over the limit 400 before anything is reserved) and is stored
  on the `GENERATING` placeholder in the request transaction. No separate column: a GENERATING note with a title was
  named by the user, since renames need `READY`. The worker then asks for a `NoteBodyDraft` (`NoteDraft` without
  `title`) in the same single provider call and adds `Note title (set by the user)` to the prompt;
  `completeChatSummary` never overwrites an existing title. A replay keeps the original title.
- **Consequences:** this replaces "the title always comes from the `NoteDraft` call" for named notes; an unnamed note
  still gets its title from `NoteDraft`.
- **Source:** task `docs/tasks/2026-10-22-summary-place-title.md`, block 3.

## 2026-10-22 — Outbox events can be debounced by key

- **Context:** the outbox had no idempotency key, so every change of a note queued its own reindex.
- **Decision:** `outbox_event.dedup_key` (nullable `text`) with a unique partial index on `PENDING` rows.
  `OutboxService.publishDebounced(type, payload, key, delay)` is one `INSERT … ON CONFLICT … DO UPDATE` that moves
  `next_attempt_at` of the pending event to now + delay, so parallel transactions never add a second one. A
  `PROCESSING` event does not hold the key, so a change made while it runs gets its own event. A failed attempt of a
  keyed event whose key is held by a newer pending event ends `FAILED` (no terminal handler) instead of retrying,
  since the pending one redoes the work. Plain `publish` is unchanged (`dedup_key` null).
- **Source:** task `docs/tasks/2026-10-22-index-place-debounce.md`, block 1.

## 2026-10-22 — Every RAG chunk carries the note's place and title

- **Decision:** `NoteIndexRequestedHandler` reads `NoteHierarchyService.getPlaceDescription` when the event runs and
  `RagService.index` starts every chunk with a header (`Constellations: …`, `Parent notes: …`, `Title: …`; lines
  without data left out), so the place shapes the embedding of each chunk, not only the first. The header counts
  toward `note.rag.chunk-size`; the text keeps at least a quarter of it. The title is no longer prepended to the text.
  Prompts and the header share `NotePlaceText`. Old notes get the header on their next reindex (no backfill).
- **Source:** task `docs/tasks/2026-10-22-index-place-debounce.md`, block 2.

## 2026-10-22 — Changed notes are reindexed an hour after the last change

- **Context:** the index now carries the note's place, so reorganizing notes would reindex (and pay for embeddings)
  on every step.
- **Decision:** `NoteIndexRequestService` queues all indexing. A completed summary note is indexed at once
  (`requestNow`, plain `publish`); every other change goes through `publishDebounced` with key
  `NOTE_INDEX_REQUESTED:<noteId>` and `note.rag.reindex-delay` (default `1h`). Changes of the place, of a parent's
  title, and of a constellation's name or position reindex the note with all its sub-notes; a content-only edit or a
  summary update only the note; a colour change nothing. Only `READY` notes are queued: a placeholder placed while
  `GENERATING` gets its place in its first index, so it pays for no second one.
- **Source:** task `docs/tasks/2026-10-22-index-place-debounce.md`, block 3.

## 2026-10-22 — The chat assistant adds to the conversation and searches notes per topic

- **Context:** the chat prompt asked the model to help the user put their own ideas into words and to offer no
  interpretation of its own, so replies paraphrased the user and ended with "why do you think so?". With
  `reasoning_effort: none` the model rarely called `searchNotes`: in a six-turn chat about a favourite series it
  searched once.
- **Decision:** `CHAT_SYSTEM_PROMPT` forbids restating the user and requires each reply to add something they did not
  say (a fact, consequence, counterexample, connection, concrete case); a question is optional and must follow from
  that addition. The model searches notes when a personal topic starts or changes, mentions a found note only when it
  changes the reply (at most once per reply, never as the opener), and says "no notes" only when the user asked about
  them. The user still picks the topics. This refines the "searches only when needed" policy of "The chat model
  searches the user's notes through a tool" into a search per personal topic or explicit request.
- **Consequences:** behavior is checked by hand, not by tests. Tool calls and found fragments are not in the history,
  so the model judges a topic change from the text alone and loses earlier fragments on later turns. If the model
  still skips the search, the next step is a search before the first message of a topic in code.
- **Source:** task `docs/tasks/2026-10-22-chat-prompt-contribution.md`.

## 2026-10-22 — A chat reply does not depend on the client's connection

- **Context:** a phone suspended the tab nine seconds into a reply, while the model was still choosing a notes
  search. The disconnect cancelled the reply `Flux`, `usingWhen` saved the turn as `FAILED`, and the reloaded page
  showed "failed to reply". The client also never got `Chat-Turn-Id`: Spring MVC 7 commits the response headers only
  with the first SSE record, and nothing was sent before the model's first event.
- **Decision:** `AssistantService` starts a generation on the first subscription and runs it to its end on its own
  subscription; the HTTP stream reads its events from a unicast sink, and a subscriber that leaves no longer cancels
  it. `cancelTurn` disposes the generation running on this instance after the turn is `CANCELED`, so Stop still
  ends the provider call. `withHeartbeat` sends its first comment at once, so every SSE stream (chat, ai-edit,
  status) commits its headers immediately.
- **Consequences:** the outcome of a turn comes only from the provider stream (or a cancel, or an expired lease). A
  cancel reaches only the instance that runs the generation; another instance's generation is still fenced out. SSE
  streams begin with `:keepalive`.
- **Source:** task `docs/tasks/2026-10-22-chat-turn-detach-retry.md`, block 1.

## 2026-10-22 — A failed or interrupted reply is retried in the same turn

- **Context:** a reply that failed or broke off could only be followed by a new message; resending the text would
  duplicate the user message in the history.
- **Decision:** `POST /chats/{chatId}/turns/{turnId}/retry?messageId=` restarts the turn when `messageId` is its
  `FAILED` or `PARTIAL` reply and the chat's latest message: under the chat lock the turn goes back to `GENERATING`
  as `attempt + 1` with a fresh lease (`ChatTurnStore.restartFinished`), the old reply is deleted, and generation
  runs on the history up to the user message. The `messageId` makes the request idempotent without a key: once the
  reply is replaced, a repeated retry replays the turn's outcome. Only the user starts a retry; the server never
  retries on its own. `maxAttempts` still bounds only the reclaim of expired leases, and a retry does not move
  `chat.updated_at`.
- **Consequences:** a summary note whose boundary is the replaced reply moves to the message before it, so the new
  reply is summarized later; a summary request still pending through that reply blocks the retry with
  `409 SUMMARY_IN_PROGRESS`, since its worker reads messages through it. A `CANCELED` ("stopped") reply is not retried.
- **Source:** task `docs/tasks/2026-10-22-chat-turn-detach-retry.md`, block 2.

## 2026-10-22 — A retry releases the summary boundary only once it is certain

- **Context:** refines "A failed or interrupted reply is retried in the same turn" after code review: the facade
  released the summary boundary before the turn was checked, so a retry that only replayed a turn still moved it.
- **Decision:** `ChatTurnService.resolveRetryRequest` takes a callback that the facade fills with
  `NoteSummaryService.releaseReplyForRetry`; it runs under the chat lock after every check, right before the reply is
  deleted. `cancelTurn` stops the running generation only when the turn ends `CANCELED`, so a reply saved just
  before a Stop still reports `done`.
- **Consequences:** every retry spends an attempt, so after `maxAttempts` attempts a turn whose lease later expires
  (a restart mid-reply) is failed instead of reclaimed by the resend after a reload; the user retries it again.
- **Source:** task `docs/tasks/2026-10-22-chat-turn-detach-retry.md` (code review).

## 2026-10-23 — A note has an emoji icon of the user's choice

- **Decision:** `notes.icon` (nullable `varchar(32)`) holds one emoji, separate from the title, so renames, the
  50-code-point title rule and search stay as they are. `NoteIconNormalizer` accepts exactly one extended grapheme
  cluster (`BreakIterator`) made only of emoji and emoji components, whose base is emoji-presented (Emoji_Presentation,
  VS16 or a keycap), so ZWJ sequences, skin tones, flags and keycaps pass and text, a bare digit or `©`, two emoji or
  combining marks are `400`. The user sets it in `SummarizeRequest.icon` (CREATE only, stored on the placeholder) and in
  `PUT /notes/{id}` (absent or null removes it, as PUT replaces the editable fields); the model never chooses one. Every
  response that names a note carries `icon` next to `title`.
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, block 1.

## 2026-10-23 — The note icon goes into the prompts and the index title line

- **Decision:** the summary prompt adds `Note icon (set by the user): 🎷` next to the user's title, the update prompt
  and the RAG header's title line show `🎷 Giant Steps` (`NotePlaceText.titleWithIcon`). Parent notes in the header and
  the prompts stay named by title only, so an icon change reindexes (debounced) only the note, not its sub-notes. The
  `NoteDraft` title rule forbids emoji, so the model never duplicates the icon in the name.
- **Source:** task `docs/tasks/2026-10-22-note-icon-emoji.md`, block 2.
