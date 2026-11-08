-- A manual note's create request key and body fingerprint: a retry recovers the note, a reused key with another body is refused.
ALTER TABLE note.notes
    ADD COLUMN idempotency_key     UUID,
    ADD COLUMN request_fingerprint BYTEA;

ALTER TABLE note.notes
    ADD CONSTRAINT uq_notes_user_idempotency_key UNIQUE (user_id, idempotency_key);
