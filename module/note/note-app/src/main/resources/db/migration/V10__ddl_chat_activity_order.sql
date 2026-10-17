-- chat.updated_at is the chat's last activity (message, rename, summarize); backfill it from the latest message.
UPDATE note.chat c
SET updated_at = m.last_message_at
FROM (SELECT chat_id, MAX(created_at) AS last_message_at
      FROM note.chat_message
      GROUP BY chat_id) m
WHERE m.chat_id = c.id
  AND m.last_message_at > c.updated_at;

-- chat lists, newest activity first; it also serves every lookup by user_id, so the old index goes.
CREATE INDEX idx_chat_user_id_updated_at ON note.chat (user_id, updated_at DESC, id DESC);
DROP INDEX note.idx_chat_user_id;
