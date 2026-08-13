# CLAUDE.md — `note-service`

Гайд по `module/note/note-app` (`io.uliss.note_service`, gradle-модуль `:note`). Кросс-cutting
правила (workflow, конвенции, closed decisions) — в корневом `CLAUDE.md`, читать сначала его.

## Note service (scaffold, RAG-ready)

`note-service` — заготовка сервиса заметок: рабочий срез `POST /note/ask` через Spring AI поверх
DeepSeek, плюс схема БД под будущий RAG. Префикс `/note` даёт `WebMvcPathPrefixConfig`
(`AskController` объявлен без своего `@RequestMapping`, только `@PostMapping("/ask")` — см.
«Path-prefix convention» в корневом `CLAUDE.md`). RAG-обогащение (embedding-модель, retrieval,
advisor) — не реализовано, это следующая итерация.

- **AI-провайдер — DeepSeek** (не Anthropic, с которого начинали): стартер `spring-ai-starter-model-deepseek`
  (каталог `spring-ai-starter-deepseek`, `version.ref = "spring-ai"`, версия — только в
  `libs.versions.toml`). Модель по умолчанию — `deepseek-v4-flash` (`DEEPSEEK_MODEL`). Конфиг —
  **плоско** под `spring.ai.deepseek.*`, без вложенности `chat.options.*` (в отличие от anthropic):
  `spring.ai.deepseek.api-key`, `spring.ai.deepseek.chat.model`. `ChatClientConfig` — тонкий бин
  `ChatClient` из автоконфигурного `ChatClient.Builder`, провайдер-агностичен (не завязан на DeepSeek
  явно) — смена провайдера в будущем не потребует его менять.
- **Готча смены AI-стартера — коллизия `RetryTemplate`:** в отличие от anthropic, автоконфиг DeepSeek
  транзитивно тянет `spring-ai-autoconfigure-retry`, который регистрирует свой бин `retryTemplate`.
  Поэтому общий `RetryTemplate` в `:exception` называется `optimisticLockRetryTemplate` (не
  `retryTemplate`) — см. описание `:exception` в корневом `CLAUDE.md` («Modules»). При добавлении
  AI-стартера в другой модуль эта коллизия не всплывёт снова именно по этой причине; но если сам
  DeepSeek-стартер сменится на другой AI-провайдер с похожей transitive-зависимостью — проверить
  `./gradlew :note:dependencies` на предмет повторного дубля имени бина.
- **Данные (схема `note`):** Flyway `V1__ddl_create_note_schema.sql` — extension `vector` (pgvector) +
  две таблицы: `notes` (обычные записи, `: AuditEntity`, `created_by`/`updated_by` через JWT-aware
  `auditorProvider` из `:security`) и `note_embeddings` (RAG, `: UuidEntity`, FK `note_id → notes.id
  ON DELETE CASCADE`, `vector(384)` — размерность-заглушка под будущую embedding-модель).
- **Старт без ключа:** `DEEPSEEK_API_KEY` может быть пустым — приложение поднимается, ключ нужен
  только на сам вызов `/ask` (иначе DeepSeek ответит ошибкой авторизации).
- **Известные пробелы (не RAG-фичи, долг scaffold):** `/actuator/health` по-прежнему под
  аутентификацией (см. общее правило `:security`, `module/lib/security/CLAUDE.md`) — открытие для
  k8s-проб ещё предстоит.
