# Architecture decisions: note-service

Append-only log of architecture decisions. Newest at the end; a reversed decision gets a new entry that names the
one it replaces. Format: see the repository `CLAUDE.md` ("Architecture decisions").

## 2026-10-14 — Outbox claims are fenced by a lease id

- **Decision:** every claim counts as an attempt and issues a new `leaseId`; `complete`/`recordFailure` apply only
  while the lease still matches. An expired claim that used the last attempt is failed (with its terminal handler)
  instead of being handed out again. Leases derive from the OpenAI SDK settings (`spring.ai.openai.*`).
- **Consequences:** domain writes made by a handler are not fenced; a handler must check the domain state itself.
- **Source:** commits `0903875`, `5cb5ec4`.

## 2026-10-15 — An instance claims only event types it can handle

- **Context:** with attempts counted per claim, an instance without a handler for a type (rolling deploy) burned the
  attempts of that type's events until they failed.
- **Decision:** `OutboxService.claim()` filters by the types of the registered `OutboxHandler`s (injected with
  `@Lazy` to break the OutboxService → service → handler → OutboxService cycle).
- **Source:** commit `578468f`.

## 2026-10-15 — Assistant replies without text are not history

- **Decision:** one predicate, `ChatMessageEntity.isEmptyAssistantReply()` (assistant role, blank content), removes
  such replies from the provider chat history and from the summary retrieval query. The summary prompt itself still
  sees every message with its status.
- **Source:** commits `f1de74d`, `55da254`.

## 2026-10-14 — The note status stream is bounded

- **Decision:** the stream sends SSE comment heartbeats and closes after 10 minutes; the SPA re-reads the note and
  reconnects while it is generating (`module/web/DECISIONS.md`).
- **Source:** commits `bbfc872`, `77a398b`.

## 2026-10-15 — A summary that outlives its lease is dropped

- **Context:** the outbox fails a note when the last attempt's lease expires, while that worker may still be waiting
  for the provider (the OpenAI SDK honours any server `Retry-After` without an upper bound). Accepting the late
  result (commit `d57c929`) produced duplicate notes when the user had already requested a new summary.
- **Decision:** replaces "accept a late chat summary for a failed note" (`d57c929`, `6b5cba8`): late is late.
  `completeChatSummary` saves only into a GENERATING note. To keep the wait short, the summary lease is bounded to
  6 minutes (chat `max-retries: 2`, embedding `timeout: 30s` → ≈ 5.2 min), checked by a test of the shipped
  `application.yaml`.
- **Consequences:** a slow summary costs its tokens and ends FAILED; the user requests a new one. Chat turns get one
  provider retry less; embedding calls (indexing, RAG search) time out after 30 s. A worker past its lease is not
  interrupted (`docs/TECH_DEBT.md`).
- **Source:** `docs/tasks/2026-10-15-review-fixes.md`.


## 2026-10-15 — Summarize requests carry a status; one in flight per chat

- **Context:** a later Summarize appends to the chat's existing note, so one note gets many requests and the note
  status no longer describes a request.
- **Decision:** `summary_request.status` (`PENDING`, `APPLIED`, `NOTHING_NEW`, `FAILED`) replaces the unique
  `note_id`. A partial unique index allows one `PENDING` request per chat; a second one is 409
  `SUMMARY_IN_PROGRESS`. `chat_note.summarized_through_message_id` is the durable boundary of what a note covers;
  deleting the boundary message nulls it (the whole chat counts as unsummarized) instead of dropping the link.
- **Consequences:** `summary_request` stays short-lived idempotency and in-flight state; nothing durable reads it.
- **Source:** `docs/tasks/2026-10-08-summary-update.md`.

## 2026-10-15 — A later Summarize appends a dated addendum to the current note

- **Decision:** the current note is the chat's latest `READY` `CHAT_SUMMARY` note. `UPDATE` reads only the messages
  after its boundary, embeds only them for RAG and excludes the note itself from the search, and gets a
  `NoteAddendumDraft` (no title). The backend, not the model, appends `---` and a `## yyyy-MM-dd` (UTC) heading.
  `applyChatSummaryUpdate` first moves the request out of `PENDING` with a conditional update, so a redelivered or
  late event never appends twice; a concurrent rename fails the transaction on the note version and the outbox
  retries. Creating a second note from the same chat is deferred (`docs/TECH_DEBT.md`).
- **Consequences:** the latest message page carries `summary`; the SPA hides Summarize when the latest message is the
  boundary. `NOTHING_NEW` and `FAILED` outcomes are not shown to the user yet.
- **Source:** `docs/tasks/2026-10-08-summary-update.md`.

## 2026-10-16 — Outbox retries are jittered

- **Context:** events that fail together (a provider outage) were all rescheduled to the same moment and retried as one
  burst.
- **Decision:** `OutboxBackoff` keeps the 30 s doubling step capped at 30 min and spreads each delay by ±20%; the cap
  stays a hard upper bound.
- **Source:** `docs/tasks/2026-10-16-code-quality-cleanup.md`.

## 2026-10-16 — A running summary update is visible on the note

- **Context:** a note stays `READY` while its update runs, so an opened note page showed the old content and never
  learned about the addendum.
- **Decision:** note and status responses carry `updating`: the note is `READY` and has a `PENDING` summary request.
  The status stream treats `READY` as terminal only when `updating` is false; the request state stays in
  `summary_request`, no new note status.
- **Source:** `docs/tasks/2026-10-16-note-update-live-refresh.md`.
