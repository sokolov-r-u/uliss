# Note service

`module/note/note-app` (`:note`, package `io.uliss.note_service`) provides one-shot AI requests and persistent chat with
synchronous and SSE-streamed assistant replies. The database also contains the initial shape for future notes and
retrieval-augmented generation, but retrieval, embeddings, and indexing are not implemented.

## AI configuration

The service uses Spring AI with the DeepSeek starter. Provider credentials and the model come from environment-backed
Spring configuration. `ChatClientConfig` builds a provider-neutral `ChatClient`, so a future provider change should
remain primarily a dependency/configuration concern.

The DeepSeek starter contributes Spring AI retry auto-configuration. The shared application retry bean is therefore
named `optimisticLockRetryTemplate` to avoid a `retryTemplate` collision.

## Chat API and persistence

`WebMvcPathPrefixConfig` adds `/note` to REST controllers. `ChatController` exposes chat creation/listing, message
history, synchronous replies, and streaming replies beneath `/note/chats`.

`ChatService.requireOwnedChat` performs every lookup using both chat and authenticated user identifiers. Missing and
foreign chats both return not found.

`AssistantService` handles the model call:

- synchronous failure persists a `FAILED` assistant message before propagating the error;
- streaming buffers emitted content, sends `token`, `done`, or `error` SSE events, derives the final message status from
  content and termination, and persists on a bounded-elastic scheduler because JPA is blocking.

The frontend re-fetches message history after a stream terminates, making the persisted status the source of truth.

## Database

Flyway creates the service-owned `note` schema, enables pgvector, and defines notes, placeholder embedding storage,
chats, messages, and future chat-to-note links. The vector dimension is provisional until an embedding model is
selected.

The RAG-oriented tables are scaffolding only. Current deferred work, including chat-history pagination and generated
titles, is described in `docs/TECH_DEBT.md`.

The application can start without a DeepSeek key, but actual AI calls will fail authentication. Starting the application
or calling the provider still requires explicit permission under repository rules.

```bash
./gradlew :note:test
./gradlew :note:integrationTest
```

