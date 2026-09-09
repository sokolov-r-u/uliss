-- Domain-owned RAG store. Ownership is relational so retrieval cannot depend on JSON metadata filters.
CREATE TABLE note.rag_chunks
(
    id          UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    note_id     UUID         NOT NULL,
    chunk_index INT          NOT NULL,
    content     TEXT         NOT NULL,
    metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    embedding   VECTOR(1536) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT fk_rag_chunks_note_owner
        FOREIGN KEY (note_id, user_id) REFERENCES note.notes (id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_rag_chunks_note_chunk UNIQUE (note_id, chunk_index)
);

CREATE INDEX idx_rag_chunks_user_note ON note.rag_chunks (user_id, note_id);

-- Distinguishes a manually created note from one produced by chat summarization.
ALTER TABLE note.notes
    ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'CHAT_SUMMARY'));

-- Transactional Outbox: chat-summary generation and indexing are durable, retried work.
CREATE TABLE note.outbox_event
(
    id              UUID PRIMARY KEY,
    type            VARCHAR(32) NOT NULL,
    payload         JSONB       NOT NULL,
    status          VARCHAR(16) NOT NULL,
    attempts        INT         NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    version         BIGINT,
    CHECK (type IN ('NOTE_SUMMARY_REQUESTED', 'NOTE_INDEX_REQUESTED')),
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

-- Poller claim query: WHERE status = 'PENDING' AND next_attempt_at <= now().
CREATE INDEX idx_outbox_event_status_next_attempt ON note.outbox_event (status, next_attempt_at);
