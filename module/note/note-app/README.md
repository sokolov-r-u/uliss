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
turn's current outcome: `error` with `CANCELED`, or `pending`; never `done`.

`POST /note/chats/{chatId}/summarize` does not call an AI provider on the request thread. In one
short transaction it creates a `GENERATING` note, links it to the chat, and publishes a
`NOTE_SUMMARY_REQUESTED` outbox event containing the immutable last-message boundary. It returns
`202 Accepted`, echoes `Idempotency-Key`, and returns the placeholder identity/status.

A chat grows one summary note. Its current note is the latest `READY` `CHAT_SUMMARY` note linked to it;
`chat_note.summarized_through_message_id` records the last message the note covers, and the latest message page
(`GET /messages` without `before`) returns it as `summary`. A later summarize sends
`{"mode":"UPDATE","targetNoteId":...}`: the request is reserved without touching the note and publishes
`NOTE_SUMMARY_UPDATE_REQUESTED`. The update worker reads only the messages after the boundary, searches related notes
excluding the updated one, and asks for a `NoteAddendumDraft`; the backend appends it under a `## yyyy-MM-dd` (UTC)
heading, reindexes the note, and moves the boundary. Each request ends `APPLIED`, `NOTHING_NEW` (boundary moves, note
unchanged), or `FAILED`; at most one request per chat is `PENDING` (409 `SUMMARY_IN_PROGRESS`). `CREATE` with a
current note or `UPDATE` of a note that is not current is 409 `SUMMARY_NOTE_CONFLICT`.

The summary worker loads only messages through that boundary, builds a deterministic retrieval
query, embeds it, and performs exact cosine search only within the requesting user's chunks. The
current chat is authoritative; related notes are delimited as untrusted secondary context. One
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
- `PUT /note/notes/{noteId}` with `{"title", "content", "version"}` saves a user edit of a `READY` note: trailing
  whitespace is trimmed, content must be 1–100,000 characters and the title follows the rename rule (`400`
  otherwise). `version` is the `NoteResponse.version` the edit started from; a newer stored version returns
  `409 NOTE_VERSION_CONFLICT`, a pending summary update `409 NOTE_UPDATING`, any other status `409 NOTE_NOT_READY`.
  A changed note is reindexed; an unchanged edit is a no-op that keeps the version.
- `POST /note/notes/{noteId}/ai-edit` with `{"instruction", "content"}` (1–1,000 and 1–30,000 characters, `400`
  otherwise) streams a model rewrite of `content`, the text as the editor holds it, as SSE `append` (`{"text"}`)
  events ending with `done`, or `error` (`FAILED`) when the provider fails. Nothing is saved; the client saves with
  `PUT`. A missing or foreign note is `404`, a pending summary update `409 NOTE_UPDATING`, any other status
  `409 NOTE_NOT_READY`, all before the stream opens. Closing the connection cancels the provider call. Options:
  `note.ai-edit.reasoning-effort` / `verbosity`.
- `DELETE /note/notes/{noteId}` returns `204` and deletes a note in any status with its RAG chunks, chat links, and
  summary request; chats remain.

Note JSON contains `id`, `source`, `status`, nullable `title`, nullable `content`, `createdAt`, `updatedAt`, and
`updating` (a `READY` note whose summary update is still running); status events also carry `updating`. Notes created before stored titles keep a null `title`.
Missing and foreign note IDs both return 404. SSE contains status only; clients fetch note JSON
after `READY` without `updating`. Status delivery currently polls PostgreSQL once per second per open connection on a
bounded scheduler; scaling alternatives are recorded in `docs/TECH_DEBT.md`.

## Constellation API

The user's tree of constellations (`ConstellationService`); every change takes a per-user advisory lock.

- `GET /note/constellations` returns the whole tree as a flat list of `{id, parentId, name, hue, lightness,
  noteCount}`; the client builds the tree. `hue` is the root's (0–359), `lightness` is `BASE` for a root and
  `DEEP | BASE | LIGHT | PALE` for a sub-constellation; `noteCount` is 0 until notes join constellations.
- `POST /note/constellations` with `{name, parentId?}` returns `201`. A new root takes the palette tone least used by
  the user's roots; a new sub-constellation is `LIGHT` right under a root and `PALE` deeper.
- `PATCH /note/constellations/{id}` with `{name?, hue?, lightness?}`: `hue` only for a root, `lightness` only for a
  sub-constellation, at least one field, otherwise `400`.
- `POST /note/constellations/{id}/move` with `{parentId}` (null makes a root) moves the whole branch. A root moved
  under another node drops its hue and takes the default lightness of its depth; a sub-constellation made a root keeps
  its inherited hue.
- `DELETE /note/constellations/{id}` returns `204` and deletes the branch with its sub-constellations.

Names are trimmed with whitespace runs collapsed, 1–40 code points (`400` otherwise), unique regardless of case among
roots and among siblings (`409 CONSTELLATION_NAME_TAKEN`). A move into the own branch is
`409 CONSTELLATION_MOVE_CYCLE`. A missing or foreign constellation or parent is `404`.

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
performs replacement and ownership-filtered exact cosine retrieval. The indexed text is
`title + "\n\n" + content` when a title exists, otherwise only `content`. `READY` means the note is
readable; its follow-up indexing event may still be pending.

The application context can start without provider keys, but provider-backed calls will fail;
background summary/index work then follows the outbox retry policy. Starting the application or
making provider calls requires explicit permission under repository rules.

Semantic AI-generated chat titles, outbox retention, and scalable status delivery are tracked in
`docs/TECH_DEBT.md`.

```bash
./gradlew :note:test
./gradlew :note:integrationTest
```
