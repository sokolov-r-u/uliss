# Tech debt / deferred work

A list of known tech debt and agreed-upon future work, deliberately deferred — not forgotten, but
recorded here until implementation.

## Chat message history pagination (`note-service`)

**Status:** not implemented. Designed and agreed upon; implementation deferred to a separate task.

### Problem

`ChatService.listMessages(userId, chatId)` (`module/note/note-app/.../service/ChatService.kt`)
currently returns the **entire** message history of a chat in one list
(`chatMessageRepository.findByChatIdOrderByCreatedAtAsc(chatId)`). For long chats this is an
unbounded response — reading history needs pagination.

Not to be confused with `prepareTurn` in the same service: it uses the same repository method to
assemble the **full** history sent to DeepSeek on every turn — that must stay unpaginated. Pagination
only applies to the read endpoint `listMessages` / `GET /chats/{chatId}/messages`.

### Chosen approach: cursor-based (keyset) pagination by message `id`

Both offset-based (`Pageable`/`page`+`size`) and cursor-based options were considered. **Cursor-based**
was chosen:

- `ChatMessageEntity.id` is a time-based UUID (`UuidEntity`, `Generators.timeBasedEpochGenerator()`),
  monotonically increasing together with `created_at` and unique (PK) — a ready-made cursor with no
  extra tie-break field needed.
- Offset (`LIMIT`/`OFFSET`) in an actively growing chat causes shifted/duplicated rows between page
  requests when new messages are inserted in between (the normal case for a chat, where the assistant
  keeps appending to history) — the cursor-based approach is not affected by this, since the cursor is
  a specific row (`id`), not a position in the list.
- The existing index `idx_chat_message_chat_id_created_at (chat_id, created_at)`
  (`V3__ddl_create_chat_tables.sql`) already covers filtering by `chat_id`; no extra migration is
  required to start. If filtering by `id < :cursor` on top of this index turns out to be insufficiently
  fast under real load — add a dedicated `(chat_id, id)` index.

### Backend (what needs to be implemented)

- `ChatMessageRepository` (currently `CrudRepository`): add derived-query methods for reading a "page"
  of a chat's messages — older than a cursor, only `before: UUID?` + `limit`, e.g.
  `findByChatIdAndIdLessThanOrderByIdDesc(chatId, cursor, pageable)` for loading older messages, plus a
  separate method with no cursor for the first (most recent) page.
- `ChatService.listMessages` — the signature needs `limit: Int` and an optional `before: UUID?`
  (cursor = `id` of the oldest message already loaded on the frontend), keep the existing chat-ownership
  check (`requireOwnedChat`), return the page in chronological order (ASC) for display.
- `ChatController.listMessages` (`GET /chats/{chatId}/messages`) — add query parameters `limit`
  (required or with a sensible default, e.g. 50) and `before` (optional; absent = latest page/most
  recent messages).
- Response shape — a metadata envelope instead of a flat `List<ChatMessageResponse>`: needs a field
  telling the client whether there are more older messages (`hasMore`), and/or a cursor for the next
  request (`nextCursor`), so the frontend doesn't have to guess the end of history from a partial page.
  The exact DTO shape is an implementation detail; this semantics must be preserved.

### Frontend (what needs to be implemented symmetrically)

- The chat screen must fetch messages page by page: on chat open — no `before` (latest `limit`
  messages), on scroll-up to the top of the list — with `before = id` of the oldest message already
  rendered; loaded messages are prepended to the **start** of the list.
- The frontend decides and sends `limit` (page size / how many messages to fetch at a time).
- Keep per-chat pagination state: cursor of the oldest loaded message + the `hasMore` flag from the
  backend response; stop fetching once `hasMore = false`.
- Changing the response shape of `GET /chats/{chatId}/messages` (envelope instead of a flat list) is a
  breaking contract change — backend and frontend must be updated together, in the same task.

### Not in scope for the current task

Recorded as a future plan — implementation (backend + frontend) is a separate task.
