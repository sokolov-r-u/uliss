-- Collapses repeated requests for the same work (e.g. NOTE_INDEX_REQUESTED:<noteId>) into one pending event.
ALTER TABLE note.outbox_event
    ADD COLUMN dedup_key TEXT;

CREATE UNIQUE INDEX uq_outbox_event_pending_dedup_key ON note.outbox_event (dedup_key)
    WHERE status = 'PENDING' AND dedup_key IS NOT NULL;
