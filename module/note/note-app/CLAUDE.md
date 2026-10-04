# Note service instructions

Read the repository `CLAUDE.md`, this module's `README.md`, and the security-library guidance before editing
note-service.

## Invariants

- The service owns persistent chats, asynchronous summaries, notes, and the future note/RAG schema. Do not describe
  RAG retrieval or indexing as implemented until corresponding code exists.
- Every chat read/write must enforce ownership with the authenticated user identifier. A chat owned by someone else
  remains indistinguishable from a missing chat.
- Persist the user message before requesting an assistant response. Persist a terminal `FAILED` assistant message when
  a turn fails before producing content.
- Streaming must derive `COMPLETE`, `PARTIAL`, or `FAILED` from the terminal signal and buffered content, and run
  blocking JPA persistence off the reactive event-loop thread.
- Preserve the SSE contract (`append`, `pending`, `done`, `error`) and the `/note` prefix supplied by
  `WebMvcPathPrefixConfig`.
- Keep `ChatClientConfig` provider-neutral. Provider selection and model properties belong in configuration.
- The shared optimistic-lock retry bean is `optimisticLockRetryTemplate`; do not introduce a conflicting generic
  `retryTemplate` bean.

## Implementation rules

- Keep controller code limited to transport and authentication mapping; conversation orchestration belongs in services.
- Changes to SSE events, message status, ownership lookup, or chat DTOs are frontend contract changes and require
  synchronized web tests/changes.
- Flyway migrations are append-only. Add a new versioned migration for every schema change; never edit an existing
  migration. Preserve the service-owned `note` schema and pgvector compatibility.
- Message pagination is limited to the existing browser-history contract.
- Initial chat creation and first-turn reservation happen in one transaction, deriving the title from the first user
  message there. The frontend must not generate chat IDs or titles; no provider call may be added for title
  generation without explicit scope.
- Persist the initial request key so a retry can recover the backend-generated chat after response loss.

## Package layout

Folders are organized by architectural role, not by domain — `chat` and `note` classes stay mixed
within each role folder; split a role folder by domain only if it actually becomes hard to navigate,
never preemptively (a `graph` domain is planned but doesn't exist yet).

- `model/` — JPA `@Entity` + enums only. `model/payload/` — JSON blobs living inside another
  entity's column (not their own table). `model/projection/` — hand-mapped via raw `JdbcTemplate`
  (e.g. `ChatTurn`), not Hibernate-managed.
- `*Properties` (raw `@ConfigurationProperties`) live next to their sole consumer, never in a shared
  `properties/` folder. `policy/` holds classes that derive a value from properties plus other
  independent config sources (e.g. a computed lease `Duration`) — properties bind 1:1 from config,
  policies compute something no config key sets directly.
- `outbox/` root is the generic engine's contract (`OutboxService`, `OutboxEventType`,
  `OutboxHandler`/`OutboxTerminalFailureHandler`, `OutboxProperties`); `outbox/infra/` is wiring
  nothing outside `outbox/` calls directly (`OutboxPoller`, `OutboxEventProcessor`). Handler
  implementations (e.g. `NoteSummaryRequestedHandler`) are business logic, not engine code — they
  live in `service/handler/`.
- `service/` root is real `@Service` orchestrators; `facade/` coordinates several services per
  controller use case; `handler/` implements an outbox entry-point interface; `output/` is a
  non-service, non-DTO return shape (e.g. `AssistantReplyStream` wraps a live `Flux`, so it can't be
  a DTO — a DTO is a materialized value, not a handle to unfinished work).
- `dto/request/` and `dto/response/` are the HTTP wire boundary — never leak a raw entity into
  either. `dto/internal/` is for result types that cross service → facade → controller but never
  HTTP.

## Verification

- Use `./gradlew :note:test` for controller and service behavior.
- Use `./gradlew :note:integrationTest` for persistence, migration, AI wiring, or streaming integration changes; Docker
  is required.
- Do not run `:note:bootRun`, call the external AI provider, or write to the database without explicit permission.
