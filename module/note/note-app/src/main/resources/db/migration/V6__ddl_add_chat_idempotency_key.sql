-- Stores the initial request's Idempotency-Key so response-loss retries recover the same chat.
ALTER TABLE note.chat
    ADD COLUMN idempotency_key UUID;

ALTER TABLE note.chat
    ADD CONSTRAINT uq_chat_user_idempotency_key UNIQUE (user_id, idempotency_key);
