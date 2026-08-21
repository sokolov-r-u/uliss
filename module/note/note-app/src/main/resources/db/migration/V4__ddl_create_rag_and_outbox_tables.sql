-- RAG store, managed by org.springframework.ai.vectorstore.pgvector.PgVectorStore. Column layout
-- mirrors PgVectorStore's own schema-init DDL exactly (schema/table name aside) even though
-- initialize-schema stays false — this migration is the schema's source of truth instead.
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE note.vector_store
(
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content   TEXT,
    metadata  JSON,
    embedding VECTOR(1536)
);

-- Superseded by vector_store above: fixed 384-dim placeholder, empty, unreachable from code.
DROP TABLE note.note_embeddings;

-- Distinguishes a manually created note from one produced by chat summarization.
ALTER TABLE note.notes
    ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'CHAT_SUMMARY'));

-- Transactional Outbox: the note (chat_note link included) and this event commit atomically,
-- so indexing is requested if and only if the note itself was persisted.
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
    CHECK (type IN ('NOTE_INDEX_REQUESTED')),
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

-- Poller claim query: WHERE status = 'PENDING' AND next_attempt_at <= now().
CREATE INDEX idx_outbox_event_status_next_attempt ON note.outbox_event (status, next_attempt_at);
