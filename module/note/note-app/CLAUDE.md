# CLAUDE.md — `note-service`

Guide for `module/note/note-app` (`io.uliss.note_service`, gradle module `:note`). Cross-cutting
rules (workflow, conventions, closed decisions) are in the root `CLAUDE.md` — read that first.

## Note service (scaffold, RAG-ready)

`note-service` — a note-taking service scaffold: a working slice, `POST /note/ask` via Spring AI on
top of DeepSeek, plus a DB schema for future RAG. The `/note` prefix comes from `WebMvcPathPrefixConfig`
(`AskController` is declared without its own `@RequestMapping`, only `@PostMapping("/ask")` — see
"Path-prefix convention" in the root `CLAUDE.md`). RAG enrichment (embedding model, retrieval,
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
- **Data (schema `note`):** Flyway `V1__ddl_create_note_schema.sql` creates only the schema (consistent
  with `auth`/`user-service` — schema-only, no tables). `V2__ddl_create_note_tables.sql` adds the
  `vector` extension (pgvector) plus two tables: `notes` (regular records, `: AuditEntity`,
  `created_by`/`updated_by` via the JWT-aware `auditorProvider` from `:security`) and `note_embeddings`
  (RAG, `: UuidEntity`, FK `note_id → notes.id ON DELETE CASCADE`, `vector(384)` — a placeholder
  dimension for the future embedding model). `V3__ddl_create_chat_tables.sql` adds
  `chat`/`chat_message`/`chat_note` (see `docs/CURRENT_TASK.md`).
- **Starts without a key:** `DEEPSEEK_API_KEY` can be empty — the application still starts up; the key
  is only needed for the actual `/ask` call (otherwise DeepSeek returns an authorization error).
- **Known gaps (not RAG features, scaffold debt):** `/actuator/health` is still behind authentication
  (see the general `:security` rule, `module/lib/security/CLAUDE.md`) — opening it up for k8s probes is
  still pending.
