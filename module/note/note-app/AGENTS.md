# Note service instructions

Read the repository `AGENTS.md`, this module's `README.md`, and the security-library guidance before editing
note-service.

## Invariants

- The service owns one-shot AI requests, persistent chats, and the future note/RAG schema. Do not describe RAG retrieval
  or indexing as implemented until corresponding code exists.
- Every chat read/write must enforce ownership with the authenticated user identifier. A chat owned by someone else
  remains indistinguishable from a missing chat.
- Persist the user message before requesting an assistant response. Persist `FAILED` assistant messages for failed
  synchronous calls.
- Streaming must derive `COMPLETE`, `PARTIAL`, or `FAILED` from the terminal signal and buffered content, and run
  blocking JPA persistence off the reactive event-loop thread.
- Preserve the SSE contract (`token`, `done`, `error`) and the `/note` prefix supplied by `WebMvcPathPrefixConfig`.
- Keep `ChatClientConfig` provider-neutral. Provider selection and model properties belong in configuration.
- The shared optimistic-lock retry bean is `optimisticLockRetryTemplate`; do not introduce a conflicting generic
  `retryTemplate` bean.

## Implementation rules

- Keep controller code limited to transport and authentication mapping; conversation orchestration belongs in services.
- Changes to SSE events, message status, ownership lookup, or chat DTOs are frontend contract changes and require
  synchronized web tests/changes.
- Flyway migrations are append-only. Preserve the service-owned `note` schema and pgvector compatibility.
- Message pagination and first-message title generation are deferred in `docs/TECH_DEBT.md`; do not implement them
  incidentally.

## Verification

- Use `./gradlew :note:test` for controller and service behavior.
- Use `./gradlew :note:integrationTest` for persistence, migration, AI wiring, or streaming integration changes; Docker
  is required.
- Do not run `:note:bootRun`, call the external AI provider, or write to the database without explicit permission.

