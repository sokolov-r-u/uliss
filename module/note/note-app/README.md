# Note service

`module/note/note-app` (`:note`, package `io.uliss.note_service`) owns one-shot AI requests,
persistent chats, asynchronous chat summaries, notes, and per-user retrieval-augmented generation (RAG).
`WebMvcPathPrefixConfig` adds `/note` to every REST controller.

## AI providers and configuration

Chat and summarization use the provider-neutral Spring AI `ChatClient`, backed by DeepSeek. RAG uses
Spring AI's `EmbeddingModel` with OpenAI `text-embedding-3-small` at 1536 dimensions. Required
credentials are `DEEPSEEK_API_KEY` and `OPENAI_API_KEY`; `DEEPSEEK_MODEL` and
`OPENAI_EMBEDDING_MODEL` override the defaults.

`spring.ai.model.chat=deepseek` and `spring.ai.model.embedding=openai` select the two providers
explicitly. The shared optimistic-lock retry bean remains named `optimisticLockRetryTemplate` to
avoid colliding with Spring AI retry auto-configuration.

## Chat and summary APIs

`ChatController` exposes chat creation/listing, message history, synchronous replies, and streamed
replies under `/note/chats`. `ChatService` performs chat lookups using both chat ID and authenticated
user ID, so missing and foreign chats are indistinguishable.

`POST /note/chats/{chatId}/summarize` does not call an AI provider on the request thread. In one
short transaction it creates a `GENERATING` note, links it to the chat, and publishes a
`NOTE_SUMMARY_REQUESTED` outbox event containing the immutable last-message boundary. It returns
`202 Accepted`, a `Location` header for the note, and the placeholder identity/status.

The summary worker loads only messages through that boundary, builds a deterministic retrieval
query, embeds it, and performs exact cosine search only within the requesting user's chunks. The
current chat is authoritative; related notes are delimited as untrusted secondary context. A
successful non-blank model response atomically changes the note to `READY` and publishes
`NOTE_INDEX_REQUESTED`. The final configured failure changes a still-generating note to `FAILED` in
the same transaction that terminally fails the outbox event.

## Note API and status delivery

- `GET /note/notes` returns the authenticated user's notes newest first.
- `GET /note/notes/{noteId}` returns the ownership-filtered persisted note.
- `GET /note/notes/{noteId}/status/stream` immediately emits `event: status`, emits only persisted
  status changes, and closes on `READY` or `FAILED`.

Note JSON contains `id`, `source`, `status`, nullable `content`, `createdAt`, and `updatedAt`.
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
performs replacement and ownership-filtered exact cosine retrieval. `READY` means the note is
readable; its follow-up indexing event may still be pending.

The application context can start without provider keys, but provider-backed calls will fail;
background summary/index work then follows the outbox retry policy. Starting the application or
making provider calls requires explicit permission under repository rules.

Deferred chat pagination, generated chat titles, outbox retention, and scalable status delivery are
tracked in `docs/TECH_DEBT.md`.

```bash
./gradlew :note:test
./gradlew :note:integrationTest
```
