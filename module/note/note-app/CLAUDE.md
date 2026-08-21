# CLAUDE.md — `note-service`

Guide for `module/note/note-app` (`io.uliss.note_service`, gradle module `:note`). Cross-cutting
rules (workflow, conventions, closed decisions) are in the root `CLAUDE.md` — read that first.

## Note service (chat + RAG-ready)

`note-service` — two working slices on top of Spring AI/DeepSeek: a one-shot `POST /note/ask`
(`AskController`), and a full **chat feature** (`ChatController`, see below) with persisted history
and SSE streaming. Plus a DB schema for future RAG (see "Data" below). The `/note` prefix comes from
`WebMvcPathPrefixConfig` (controllers are declared without their own `@RequestMapping` app prefix —
see "Path-prefix convention" in the root `CLAUDE.md`). RAG enrichment (embedding model, retrieval,
advisor) is not implemented yet — that's the next iteration.

- **AI provider — DeepSeek** (not Anthropic, which was the original starting point): the starter is
  `spring-ai-starter-model-deepseek` (catalog entry `spring-ai-starter-deepseek`, `version.ref = "spring-ai"`,
  version lives only in `libs.versions.toml`). Default model is `deepseek-v4-flash` (`DEEPSEEK_MODEL`).
  Config is **flat** under `spring.ai.deepseek.*`, without the `chat.options.*` nesting (unlike anthropic):
  `spring.ai.deepseek.api-key`, `spring.ai.deepseek.chat.model`. `ChatClientConfig` is a thin `ChatClient`
  bean built from the autoconfigured `ChatClient.Builder`, provider-agnostic (not tied to DeepSeek
  explicitly) — switching providers in the future won't require changing it.
- **Gotcha when switching AI starters — `RetryTemplate` collision:** unlike anthropic, DeepSeek's
  autoconfiguration transitively pulls in `spring-ai-autoconfigure-retry`, which registers its own
  `retryTemplate` bean. That's why the shared `RetryTemplate` in `:exception` is named
  `optimisticLockRetryTemplate` (not `retryTemplate`) — see the `:exception` description in the root
  `CLAUDE.md` ("Modules"). When adding an AI starter to another module, this collision won't resurface
  for that same reason; but if the DeepSeek starter itself is replaced by a different AI provider with a
  similar transitive dependency — check `./gradlew :note:dependencies` for a repeated bean-name clash.
- **Chat feature (`ChatController`, `/chats`):** `POST /chats` (create, optional `title`, defaults to
  "New chat"), `GET /chats` (list, newest first), `GET /chats/{id}/messages` (full history),
  `POST /chats/{id}/messages` (sync reply), `POST /chats/{id}/messages/stream` (SSE, `text/event-stream`,
  events `token`/`done`/`error`). `ChatService.requireOwnedChat` (`findByIdAndUserId`) enforces
  per-user ownership on every read/write — a chat that isn't the caller's 404s, not 403s. `AssistantService`
  wraps the DeepSeek `ChatClient` call for both paths:
    - `reply()` — synchronous; on a failed AI call it still persists a `FAILED` assistant message before
      rethrowing, so a broken call leaves a record in history instead of vanishing silently.
    - `streamReply()` — buffers streamed content while emitting it, then in `doFinally` derives the
      final status from the terminal `SignalType` + whatever landed in the buffer (`COMPLETE` /
      `PARTIAL` if the stream was cut short with partial content / `FAILED` if empty), and persists it.
      That persist runs on `Schedulers.boundedElastic()` — `doFinally` fires on the Reactor Netty
      event-loop thread from the DeepSeek WebClient call, and the JPA write is blocking.
    - Message pagination for `getMessages` is deliberately not implemented yet — tracked in
      `docs/TECH_DEBT.md` ("Chat message history pagination").
- **Data (schema `note`):** Flyway `V1__ddl_create_note_schema.sql` creates only the schema (consistent
  with `auth`/`user-service` — schema-only, no tables). `V2__ddl_create_note_tables.sql` adds the
  `vector` extension (pgvector) plus two tables: `notes` (regular records, `: AuditEntity`,
  `created_by`/`updated_by` via the JWT-aware `auditorProvider` from `:security`) and `note_embeddings`
  (RAG, `: UuidEntity`, FK `note_id → notes.id ON DELETE CASCADE`, `vector(384)` — a placeholder
  dimension for the future embedding model). `V3__ddl_create_chat_tables.sql` adds
  `chat`/`chat_message`/`chat_note` — backing the chat feature above (`chat_note` is unused so far,
  reserved for linking chats to notes once RAG lands).
- **Starts without a key:** `DEEPSEEK_API_KEY` can be empty — the application still starts up; the key
  is only needed for an actual AI call (`/ask` or a chat message), otherwise DeepSeek returns an
  authorization error.
