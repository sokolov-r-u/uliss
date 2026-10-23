# Note service

`module/note/note-app` (`:note`, package `io.uliss.note_service`) owns persistent chats,
asynchronous chat summaries, notes, and per-user retrieval-augmented generation (RAG).
`uliss.web.path-prefix: /note` makes the `:security` `WebMvcPathPrefixConfig` add `/note` to every REST controller.

See [REQUEST_FLOWS.md](REQUEST_FLOWS.md) for endpoint call order, transaction boundaries, chat-turn
states, and asynchronous summary/indexing diagrams.

## AI providers and configuration

Chat and summarization use the provider-neutral Spring AI `ChatClient`, backed by OpenAI
`gpt-5.6-luna`. RAG uses Spring AI's `EmbeddingModel` with OpenAI `text-embedding-3-small` at 1536
dimensions. The required credential is `OPENAI_API_KEY`; `OPENAI_CHAT_MODEL` and
`OPENAI_EMBEDDING_MODEL` override the defaults.

`spring.ai.model.chat=openai` and `spring.ai.model.embedding=openai` select the providers explicitly.
Chat replies and summaries pass OpenAI-specific `reasoningEffort` and `verbosity` per call (`note.assistant.*` and
`note.summary.*`); chat replies also set `promptCacheKey` to the chat ID so each turn reuses the cached
history prefix. Chat replies use `reasoningEffort: none`: they send the notes search tool, which Chat Completions
rejects on gpt-5.6 with any other effort (moving to the Responses API is in `docs/TECH_DEBT.md`). DeepSeek stays
configured but inactive; switching back to
`spring.ai.model.chat=deepseek` (with `DEEPSEEK_API_KEY`) also requires removing those OpenAI per-call
options from `AssistantService` and `NoteSummaryRequestedHandler`.

Dictation uses Spring AI's `TranscriptionModel` (`OpenAiAudioTranscriptionModel`, auto-configured) with
`gpt-4o-transcribe`; `OPENAI_TRANSCRIPTION_MODEL` overrides it (for example `gpt-4o-mini-transcribe`). The language is
not passed, so the model detects it.

`LOG_LEVEL_AI=debug` logs every model request (system prompt, history, RAG chunks, user prompt) and its full response
untruncated through Spring AI's `SimpleLoggerAdvisor`, a default advisor of the shared `ChatClient`; streamed replies
are logged once, aggregated.

## Chat and summary APIs

`ChatController` exposes atomic initial-chat streaming, chat listing, message history, idempotent
streamed replies, turn cancellation, and summary requests under `/note/chats`. Stream events are `activity`, `append`,
`pending`, `done`, and `error`. `append` data is JSON `{"text": "..."}`, because SSE strips a leading space from raw
`data:` lines; the others carry plain text (activity name, retry delay, terminal status, empty). `activity` is
`SEARCHING_NOTES` when a notes search starts and `THINKING` when it ends; a replayed turn sends none. `ChatService` performs chat lookups using both
chat ID and authenticated user
ID, so missing and foreign chats are indistinguishable.

`GET /note/chats` and `GET /note/chats/{chatId}` return `ChatResponse` with `noteCount`, the number of linked notes (one
grouped count query per list). `PATCH /note/chats/{chatId}` with `{"title"}` renames the chat: the title is
trimmed, inner whitespace runs collapse to one space, and 1–50 code points are required, otherwise `400` (no
truncation). `DELETE /note/chats/{chatId}` returns `204`, or `409` while a turn is generating under a live lease; an
expired lease does not block. Deletion cascades to turns, messages, summary requests, and note links; linked notes are
never deleted. Chats are listed by last activity (`updated_at`: a new message, a rename, or a new Summarize request).

`GET /note/chats/{chatId}/notes` returns the chat's linked notes as `NoteResponse`, newest first;
`GET /note/notes/{noteId}/chats` returns the chats a note was written from as `ChatResponse`, by last activity (empty
for a hand-written note or once its chats are deleted). Both are `404` for a missing or foreign chat or note.

`GET /note/chats/{chatId}/messages` uses backward keyset pagination over UUID v7 message IDs. The
latest page uses `limit=50` by default; callers may request 1 through 100 messages and pass the
exclusive `before=<messageId>` cursor returned by the previous response. The response contains
chronological `messages`, nullable `nextCursor`, and `hasMore`. The `(chat_id, id DESC)` index serves
this UI read path, while the existing creation-time index remains available for chronological
history reads.

Pagination applies only to the browser history endpoint. Chat generation still loads the complete
ordered conversation, and summary generation still loads every message through its immutable
boundary. Summary creation obtains that boundary through a separate ownership-checked latest-message
lookup rather than from a UI page.

`POST /note/chats` requires a client-generated UUID in `Idempotency-Key` but no
chat ID. In one transaction the backend generates the chat ID and title, persists the chat, reserves
the first turn, and saves its user message. `Chat-Id` and `Chat-Turn-Id` response headers expose the
two backend-generated identities. Both initial and subsequent stream responses include both headers.
The same user-scoped idempotency key recovers the same chat after a
lost response instead of creating a duplicate.

`POST /note/chats/{chatId}/messages` handles subsequent turns and also requires a client-generated UUID in
`Idempotency-Key`.
The key identifies retries of one logical send within that chat. The backend generates a separate
durable turn UUID, echoes the client key, and returns the internal identity in `Chat-Turn-Id` for
history reconciliation and cancellation. A live duplicate returns `pending`; a terminal duplicate
returns `done` or `error` without replaying text fragments or calling the provider again. A stream whose attempt
lost its fence before finalization (canceled from another tab, or reclaimed by a newer attempt) ends with the
turn's current outcome: `error` with `CANCELED`, or `pending`; never `done`. A reply keeps generating after the
client disconnects; every stream opens with a `:keepalive` comment so `Chat-Turn-Id` arrives at once.

`POST /note/chats/{chatId}/turns/{turnId}/retry?messageId=` regenerates the chat's latest reply when it is `FAILED` or
`PARTIAL`, in the same turn: the failed reply is deleted, the user message stays, and the new reply streams with the
same events. A repeated retry (the reply is already replaced) replays the turn's outcome, a generating turn answers
`pending`, any other reply is `409 CHAT_REPLY_NOT_RETRYABLE`, and a summary still being written through the reply is
`409 SUMMARY_IN_PROGRESS`.

`POST /note/chats/{chatId}/summarize` does not call an AI provider on the request thread. In one
short transaction it creates a `GENERATING` note, links it to the chat, and publishes a
`NOTE_SUMMARY_REQUESTED` outbox event containing the immutable last-message boundary. It returns
`202 Accepted`, echoes `Idempotency-Key`, and returns the placeholder identity/status. An optional `constellationId`
(CREATE only, otherwise `400`) makes that constellation the new note's main place in the same transaction, so the
note lies in the branch while it is still `GENERATING` and keeps the place if generation fails. A missing or foreign
constellation is `404 CONSTELLATION_NOT_FOUND` and nothing is reserved. Instead of it (both at once are `400`), an
optional `parentNoteId` makes the new note a sub-note of that note in the same transaction; a missing or foreign
parent is `404 PARENT_NOTE_NOT_FOUND`. An optional `title` (CREATE only, otherwise `400`) names the new note: the
rename rule applies (whitespace collapsed, at most 50 code points, `400` over it before anything is reserved), a blank
one means none, and the placeholder carries it while `GENERATING`. An optional `icon` (CREATE only, otherwise `400`)
is the user's emoji for the new note: exactly one emoji grapheme (ZWJ sequences, skin tones, flags and keycaps count
as one), `400` otherwise, blank means none; the model never chooses one. A replayed key returns the original note with
its original place, title and icon, whatever the retry sends.

A chat grows one summary note. Its current note is the latest `READY` `CHAT_SUMMARY` note linked to it;
`chat_note.summarized_through_message_id` records the last message the note covers, and the latest message page
(`GET /messages` without `before`) returns it as `summary` (`{throughMessageId, noteId, noteTitle, noteIcon}`). A later summarize sends
`{"mode":"UPDATE","targetNoteId":...}`: the request is reserved without touching the note and publishes
`NOTE_SUMMARY_UPDATE_REQUESTED`. The update worker reads only the messages after the boundary, searches related notes
excluding the updated one, and asks for a `NoteAddendumDraft`; the backend appends it under a `## yyyy-MM-dd` (UTC)
heading, reindexes the note, and moves the boundary. Each request ends `APPLIED`, `NOTHING_NEW` (boundary moves, note
unchanged), or `FAILED`; at most one request per chat is `PENDING` (409 `SUMMARY_IN_PROGRESS`). `CREATE` with a
current note or `UPDATE` of a note that is not current is 409 `SUMMARY_NOTE_CONFLICT`.

The summary worker loads only messages through that boundary, builds a deterministic retrieval
query, embeds it, and performs exact cosine search only within the requesting user's chunks. The
current chat is authoritative; related notes are delimited as untrusted secondary context. Both the create and the
update prompt carry a `NOTE PLACE` block read when the worker runs: the full name path of every constellation of the
note's top note (main first) and its parent notes from the top down, or "none — the user has not applied any tags
yet". A note the user named gets `Note title (set by the user)` in the prompt and a `NoteBodyDraft` (no `title`) from
the same single call; its title is kept. Otherwise one
non-streaming structured-output call (`.call().entity(NoteDraft)`) returns the note `title`, a
Markdown `mainThought`, and `secondaryThoughts` without a fixed limit; field rules live in the `NoteDraft` JSON
schema descriptions. The schema is sent as a provider-native constraint (`useProviderStructuredOutput()`,
OpenAI strict mode), so every field is marked required and nullable in the schema. The worker joins them into Markdown
`content` (main thought, then every secondary thought as a bulleted list). A missing or blank main thought fails the attempt; a
blank or missing title falls back to the first non-blank content line, normalized by
`TitleNormalizer` (50 code points). Success atomically stores both fields,
changes the note to `READY`, and publishes `NOTE_INDEX_REQUESTED`. The final configured failure changes a
still-generating note to `FAILED` in
the same transaction that terminally fails the outbox event.
If the chat was deleted after the request, the worker fails the note at once through the same terminal-failure
handler instead of spending retries.

## Notes search in chat replies

Chat replies can draw on the user's notes. `AssistantService` registers a per-turn `NotesSearchTool` (`searchNotes`)
on the provider request, and the system prompt tells the model to search when a reply depends on the user's tastes,
experiences, or earlier thoughts. Spring AI's tool-calling loop runs the search and calls the model again with the
results. The model chooses only the query: `ChatFacade` binds the search to the authenticated user and leaves out the
chat's current summary note. Results are note fragments with the note title and creation date, delimited as
untrusted data. `note.assistant.notes-search` sets `top-k` (5), `min-similarity` (0.30), and `max-calls-per-turn` (3,
blank queries included). A blank query, a failed search, or the first call over the limit returns a short text to the
model. Because every call costs a model round trip and Spring AI's tool loop has no cap of its own, the next call over
the limit ends the turn, and so does a search whose turn has lost its lease (`NotesSearchAbortedException`, a checked
exception that Spring AI rethrows). Each search extends the turn's lease by one full lease, because it adds a model call
to the attempt. Search results are not persisted with the reply.

## Note API and status delivery

- `GET /note/notes` returns the authenticated user's notes newest first.
- `GET /note/notes/{noteId}` returns the ownership-filtered persisted note.
- `GET /note/notes/{noteId}/status/stream` immediately emits `event: status`, emits only persisted
  status changes, and closes on `READY` or `FAILED`; a `READY` note with a running summary update (`updating: true`)
  stays open until the update finishes. A `:keepalive` comment every 15 s keeps proxies from cutting
  a quiet stream; the stream closes after 10 minutes without a terminal status.
- `PATCH /note/notes/{noteId}` with `{"title"}` renames a `READY` note (same title rule as chats; other statuses →
  `409`) and queues reindexing, because the indexed text includes the title.
- `PUT /note/notes/{noteId}` with `{"title", "content", "icon", "version"}` saves a user edit of a `READY` note: trailing
  whitespace is trimmed, content must be 1–100,000 characters and the title follows the rename rule (`400`
  otherwise). `icon` follows the summary rule; null, blank or absent removes it. `version` is the
  `NoteResponse.version` the edit started from; a newer stored version returns
  `409 NOTE_VERSION_CONFLICT`, a pending summary update `409 NOTE_UPDATING`, any other status `409 NOTE_NOT_READY`.
  A changed note is reindexed; an unchanged edit is a no-op that keeps the version.
- `POST /note/notes/{noteId}/ai-edit` with `{"instruction", "content"}` (1–1,000 and 1–30,000 characters, `400`
  otherwise) streams a model rewrite of `content`, the text as the editor holds it, as SSE `append` (`{"text"}`)
  events ending with `done`, or `error` (`FAILED`) when the provider fails. Nothing is saved; the client saves with
  `PUT`. A missing or foreign note is `404`, a pending summary update `409 NOTE_UPDATING`, any other status
  `409 NOTE_NOT_READY`, all before the stream opens. Closing the connection cancels the provider call. Options:
  `note.ai-edit.reasoning-effort` / `verbosity`.
- `DELETE /note/notes/{noteId}` returns `204` and deletes a note in any status with its RAG chunks, chat links, and
  summary request; chats remain. A note with sub-notes needs `?subNotes=KEEP|DELETE` (`409 NOTE_HAS_SUB_NOTES`
  without it): `KEEP` moves its direct sub-notes to its parent, or makes them top notes with a copy of its
  constellations (main and joining times included); `DELETE` deletes the whole subtree the same way.

Note JSON contains `id`, `source`, `status`, nullable `title`, nullable `icon`, nullable `content`, `createdAt`,
`updatedAt`, nullable `parentNoteId`, and `updating` (a `READY` note whose summary update is still running); status events also carry `updating`. Notes created before stored titles keep a null `title`.
Missing and foreign note IDs both return 404. SSE contains status only; clients fetch note JSON
after `READY` without `updating`. Status delivery currently polls PostgreSQL once per second per open connection on a
bounded scheduler; scaling alternatives are recorded in `docs/TECH_DEBT.md`.

## Constellation API

The user's tree of constellations (`ConstellationService`); every change takes a per-user advisory lock.

- `GET /note/constellations` returns the whole tree as a flat list of `{id, parentId, name, hue, lightness,
  noteCount, ownNoteCount}`; the client builds the tree. `hue` is the root's (0–359), `lightness` is `BASE` for a root
  and `DEEP | BASE | LIGHT | PALE` for a sub-constellation. `noteCount` counts distinct notes of the subtree (a note in
  Jazz and Miles counts once in Music), `ownNoteCount` the notes of the node itself.
- `POST /note/constellations` with `{name, parentId?}` returns `201`. A new root takes the palette tone least used by
  the user's roots; a new sub-constellation is `LIGHT` right under a root and `PALE` deeper.
- `PATCH /note/constellations/{id}` with `{name?, hue?, lightness?}`: `hue` only for a root, `lightness` only for a
  sub-constellation, at least one field, otherwise `400`.
- `POST /note/constellations/{id}/move` with `{parentId}` (null makes a root) moves the whole branch. A root moved
  under another node drops its hue and takes the default lightness of its depth; a sub-constellation made a root keeps
  its inherited hue.
- `GET /note/constellations/{id}/notes` returns the notes of the constellation itself as `NoteResponse`, newest first.
- `GET /note/constellations/{id}/deletion` returns `{notesToMove}`: the notes placed only inside the branch.
- `DELETE /note/constellations/{id}?moveTo=<id>` returns `204` and deletes the branch with its sub-constellations in one
  transaction. Notes are never deleted: a note with places outside the branch loses only those inside it (promoting a
  new main if needed); a note placed only inside moves to `moveTo` as its main place, or without `moveTo` is left
  without a constellation. A `moveTo` inside the branch is `400`, a missing or foreign one `404`.

Notes belong to constellations through `note_constellation` (`NotePlacementService`, under the same per-user lock):

- `GET /note/notes/{noteId}/constellations` returns `[{constellationId, main}]`, main first, then by joining time.
- `POST /note/notes/{noteId}/constellations` with `{constellationId}` adds a membership; the first one is main, an
  existing one is unchanged.
- `PUT /note/notes/{noteId}/constellations/main` with `{constellationId, replace}` makes the constellation main
  (joining it if needed); `replace: true` drops the previous main, `false` keeps it as a secondary membership.
- `DELETE /note/notes/{noteId}/constellations/{constellationId}` removes a membership; a removed main promotes the
  oldest remaining one.
- A note has at most one place on each root-to-leaf line: adding or making main a constellation above or below an
  existing place replaces that place (its main flag passes on). Moving a branch so that two places of a note share a
  line keeps the deeper one; a lost main passes to the oldest remaining descendant place.
- All three changes return the new list. A note with a parent note inherits its place:
  `409 NOTE_PLACE_INHERITED`. A missing or foreign note is `404`, a missing or foreign constellation
  `404 CONSTELLATION_NOT_FOUND`.
- `GET /note/notes/without-constellation` returns top notes with no constellation together with all their sub-notes,
  newest first.

Sub-notes (`NoteHierarchyService`, under the same per-user lock): a note has either constellations of its own or a
parent note (`parentNoteId`), at any depth; it lives where its top note lives, so tree counts and "Notes here"
(`GET /note/constellations/{id}/notes` returns the node's notes with all their sub-notes) include sub-notes, and a
client nests them by `parentNoteId`.

- `PUT /note/notes/{noteId}/parent` with `{parentNoteId}` moves the note under that note and drops its own
  constellations; its sub-notes follow. Under itself or one of its descendants is `409 NOTE_MOVE_CYCLE`, a missing or
  foreign parent `404 PARENT_NOTE_NOT_FOUND`. Returns the note's place.
- `DELETE /note/notes/{noteId}/parent?moveTo=<constellationId>` moves a sub-note out: `moveTo` becomes its only, main
  constellation; without it the note has no place. A top note is left as it is. Returns the place.
- `GET /note/notes/{noteId}/place` returns `{ancestors: [{id, title, icon}], constellations: [{constellationId, main}]}`:
  parent notes from the top one down and the top note's constellations, main first.
- `GET /note/notes/{noteId}/sub-notes` returns the direct sub-notes as `NoteResponse`, newest first.
- `GET /note/notes/search?q=<text>&exclude=<noteId>` returns up to 20 titled notes whose title contains `q` regardless
  of case (prefix matches first, then the newest), without `exclude` and its sub-notes, each as
  `{id, title, icon, ancestors, constellationId}` with the main constellation of its top note.

Names are trimmed with whitespace runs collapsed, 1–40 code points (`400` otherwise), unique regardless of case among
roots and among siblings (`409 CONSTELLATION_NAME_TAKEN`). A move into the own branch is
`409 CONSTELLATION_MOVE_CYCLE`. A missing or foreign constellation or parent is `404`.

## Sky API

`GET /note/sky` (`SkyService`) returns everything the sky draws in one read-only, repeatable-read snapshot:
`{constellations, notes}`. `constellations` is the same flat tree as `GET /note/constellations`. `notes` are the stars,
oldest first, without their text: `{id, title, icon, parentNoteId, createdAt, memberships: [{constellationId, main}]}`. A star
is a `READY` note with a title. `parentNoteId` is the nearest ancestor that is itself a star; a star without one
carries its top note's memberships, main first, and every other star has none (it lives where its parent lives).

## Speech API

- `GET /note/speech/settings` returns `{"maxDurationSeconds"}` from `note.speech.max-duration` (default 5 minutes);
  the browser stops a recording there. The server cannot check the length, because it never decodes audio.
- `POST /note/speech/transcriptions`, `multipart/form-data` with one `audio` part, returns `{"text"}` (trimmed, empty
  for silence). The part's type must be `audio/webm`, `audio/ogg` or `audio/mp4` (codec parameters allowed) and its
  first bytes the same container's signature, otherwise `400 UNSUPPORTED_AUDIO`; a missing part is the same refusal.
  Over `note.speech.max-file-size` (10 MB) → `413 AUDIO_TOO_LARGE`; a body over the multipart backstop (11 MB) is
  refused by Spring with `413` before the controller. A provider failure is `502 TRANSCRIPTION_FAILED`; the client
  keeps the recording and offers a manual retry. Audio is not stored or logged.

## Outbox and RAG storage

The poller claims due work with `FOR UPDATE SKIP LOCKED`, runs each event independently on Boot's
virtual-thread task executor, and keeps embedding, retrieval, and LLM calls outside database
transactions. Current defaults are four concurrent events, three outbox attempts, exponential
backoff with ±20% jitter, and a visibility lease derived from provider timeouts with a safety factor (summary lease ≈ 5.2
minutes, kept within 6 by a test of the shipped `application.yaml`).

RAG chunks live in the domain-owned `note.rag_chunks` table. `user_id` and `note_id` are typed
columns with an ownership-preserving composite foreign key; they are not authorization metadata in
generic JSON. Spring AI still owns token splitting and embedding/batching. `JdbcRagChunkStore`
performs replacement and ownership-filtered exact cosine retrieval. Every chunk of a note starts with a header of its
place and title (`Constellations: Music / Jazz; Films`, `Parent notes: "Coltrane"`, `Title: …`; lines without data are
left out), read when the index event runs, so the place shapes every chunk's embedding; the header counts toward
`note.rag.chunk-size`. `READY` means the note is readable; its follow-up indexing event may still be pending.

A new summary note is indexed at once (`NOTE_INDEX_REQUESTED` without a key). Every later change reindexes a `READY`
note no earlier than `note.rag.reindex-delay` (default `1h`) after its last change: `OutboxService.publishDebounced`
keeps one `PENDING` event per `dedup_key` `NOTE_INDEX_REQUESTED:<noteId>` and moves its `next_attempt_at`. A change
while the event is running queues another one. What reindexes which notes:

- edit of the content: the note; edit of the title or a rename: the note and its sub-notes (their parent chain);
- an applied summary update: the note;
- adding, changing the main of, or removing a place; moving under a note or out: the note and its sub-notes;
- deleting a note but keeping its sub-notes: those sub-notes and theirs;
- renaming, moving, or deleting (notes moved or left without a place) a constellation: the notes placed in its branch
  and their sub-notes. A colour change reindexes nothing.

Old notes get the place header on their next reindex; there is no backfill.

The application context can start without provider keys, but provider-backed calls will fail;
background summary/index work then follows the outbox retry policy. Starting the application or
making provider calls requires explicit permission under repository rules.

Semantic AI-generated chat titles, outbox retention, and scalable status delivery are tracked in
`docs/TECH_DEBT.md`.

```bash
./gradlew :note:test
./gradlew :note:integrationTest
```
