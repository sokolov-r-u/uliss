-- Coverage boundary of a chat summary note: the last chat message the note covers.
-- Deleting the boundary message keeps the link; a null boundary means the whole chat is unsummarized.
ALTER TABLE note.chat_note
    ADD COLUMN summarized_through_message_id UUID,
    ADD CONSTRAINT fk_chat_note_summary_boundary
        FOREIGN KEY (summarized_through_message_id, chat_id)
            REFERENCES note.chat_message (id, chat_id) ON DELETE SET NULL (summarized_through_message_id);

UPDATE note.chat_note cn
SET summarized_through_message_id = r.through_message_id
FROM note.summary_request r
         JOIN note.notes n ON n.id = r.note_id
WHERE cn.chat_id = r.chat_id
  AND cn.note_id = r.note_id
  AND n.status = 'READY';

-- Outcome of a summarize request; the request row is short-lived idempotency and in-flight state.
ALTER TABLE note.summary_request
    ADD COLUMN status VARCHAR(16);

UPDATE note.summary_request r
SET status = CASE n.status
                 WHEN 'READY' THEN 'APPLIED'
                 WHEN 'FAILED' THEN 'FAILED'
                 ELSE 'PENDING'
    END
FROM note.notes n
WHERE n.id = r.note_id;

-- Keep one in-flight request per chat; older ones still finish their notes through the outbox.
UPDATE note.summary_request r
SET status = 'FAILED'
WHERE r.status = 'PENDING'
  AND EXISTS (SELECT 1
              FROM note.summary_request newer
              WHERE newer.chat_id = r.chat_id
                AND newer.status = 'PENDING'
                AND (newer.created_at, newer.idempotency_key) > (r.created_at, r.idempotency_key));

ALTER TABLE note.summary_request
    ALTER COLUMN status SET NOT NULL,
    ADD CONSTRAINT chk_summary_request_status
        CHECK (status IN ('PENDING', 'APPLIED', 'NOTHING_NEW', 'FAILED')),
    DROP CONSTRAINT uq_summary_request_note_id;

CREATE INDEX idx_summary_request_note_id ON note.summary_request (note_id);
CREATE UNIQUE INDEX uq_summary_request_pending_chat ON note.summary_request (chat_id) WHERE status = 'PENDING';

ALTER TABLE note.outbox_event
    DROP CONSTRAINT outbox_event_type_check,
    ADD CONSTRAINT outbox_event_type_check
        CHECK (type IN ('NOTE_SUMMARY_REQUESTED', 'NOTE_SUMMARY_UPDATE_REQUESTED', 'NOTE_INDEX_REQUESTED'));
