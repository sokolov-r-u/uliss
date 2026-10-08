# Note service

`module/note/note-app` (`:note`, package `io.uliss.note_service`) owns persistent chats,
asynchronous chat summaries, notes, and per-user retrieval-augmented generation (RAG).
`WebMvcPathPrefixConfig` adds `/note` to every REST controller.

See [REQUEST_FLOWS.md](REQUEST_FLOWS.md) for endpoint call order, transaction boundaries, chat-turn
states, and asynchronous summary/indexing diagrams.

## AI providers and configuration

Chat and summarization use the provider-neutral Spring AI `ChatClient`, backed by DeepSeek. RAG uses
Spring AI's `EmbeddingModel` with OpenAI `text-embedding-3-small` at 1536 dimensions. Required
credentials are `DEEPSEEK_API_KEY` and `OPENAI_API_KEY`; `DEEPSEEK_MODEL` and
`OPENAI_EMBEDDING_MODEL` override the defaults.

`spring.ai.model.chat=deepseek` and `spring.ai.model.embedding=openai` select the two providers
explicitly. The shared optimistic-lock retry bean remains named `optimisticLockRetryTemplate` to
avoid colliding with Spring AI retry auto-configuration.

## Chat and summary APIs

`ChatController` exposes atomic initial-chat streaming, chat listing, message history, idempotent
streamed replies, turn cancellation, and summary requests under `/note/chats`. Stream events are `append`, `pending`,
`done`, and `error`. `ChatService` performs chat lookups using both chat ID and authenticated user
ID, so missing and foreign chats are indistinguishable.

`GET /note/chats` and `GET /note/chats/{chatId}` return `ChatResponse` with `noteCount`, the number of linked notes (one
grouped count query per list). `PATCH /note/chats/{chatId}` with `{"title"}` renames the chat: the title is
trimmed, inner whitespace runs collapse to one space, and 1–50 code points are required, otherwise `400` (no
truncation). `DELETE /note/chats/{chatId}` returns `204`, or `409` while a turn is generating under a live lease; an
expired lease does not block. Deletion cascades to turns, messages, summary requests, and note links; linked notes are
never deleted.

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
returns `done` or `error` without replaying text fragments or calling the provider again.

`POST /note/chats/{chatId}/summarize` does not call an AI provider on the request thread. In one
short transaction it creates a `GENERATING` note, links it to the chat, and publishes a
`NOTE_SUMMARY_REQUESTED` outbox event containing the immutable last-message boundary. It returns
`202 Accepted`, echoes `Idempotency-Key`, and returns the placeholder identity/status.

The summary worker loads only messages through that boundary, builds a deterministic retrieval
query, embeds it, and performs exact cosine search only within the requesting user's chunks. The
current chat is authoritative; related notes are delimited as untrusted secondary context. One
non-streaming structured-output call (`.call().entity(NoteDraft)`) returns the note `title` and
Markdown `content`; field rules live in the `NoteDraft` JSON schema descriptions. Missing or blank
`content` fails the attempt; a blank or missing title falls back to the first non-blank content
line, normalized by `TitleNormalizer` (50 code points). Success atomically stores both fields,
changes the note to `READY`, and publishes `NOTE_INDEX_REQUESTED`. The final configured failure changes a
still-generating note to `FAILED` in
the same transaction that terminally fails the outbox event.
If the chat was deleted after the request, the worker fails the note at once through the same terminal-failure
handler instead of spending retries.

## Note API and status delivery

- `GET /note/notes` returns the authenticated user's notes newest first.
- `GET /note/notes/{noteId}` returns the ownership-filtered persisted note.
- `GET /note/notes/{noteId}/status/stream` immediately emits `event: status`, emits only persisted
  status changes, and closes on `READY` or `FAILED`.
- `PATCH /note/notes/{noteId}` with `{"title"}` renames a `READY` note (same title rule as chats; other statuses →
  `409`) and queues reindexing, because the indexed text includes the title.
- `DELETE /note/notes/{noteId}` returns `204` and deletes a note in any status with its RAG chunks, chat links, and
  summary request; chats remain.

Note JSON contains `id`, `source`, `status`, nullable `title`, nullable `content`, `createdAt`, and
`updatedAt`. Notes created before stored titles keep a null `title`.
Missing and foreign note IDs both return 404. SSE contains status only; clients fetch note JSON
after `READY`. Status delivery currently polls PostgreSQL once per second per open connection on a
bounded scheduler; scaling alternatives are recorded in `docs/TECH_DEBT.md`.

## Outbox and RAG storage

The poller claims due work with `FOR UPDATE SKIP LOCKED`, runs each event independently on Boot's
virtual-thread task executor, and keeps embedding, retrieval, and LLM calls outside database
transactions. Current defaults are four concurrent events, three outbox attempts, exponential
backoff, and a visibility lease derived from provider timeouts with a safety factor.

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
