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
