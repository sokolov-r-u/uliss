CREATE EXTENSION IF NOT EXISTS vector;

-- Main notes table: plain user records. created_by/updated_by = user profile id or 'SYSTEM'.
CREATE TABLE note.notes
(
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL
);

CREATE INDEX idx_notes_user_id ON note.notes (user_id);

-- RAG store: one note -> many chunk embeddings. Vector index (ivfflat/hnsw)
-- and chunk text are deferred to the RAG iteration.
CREATE TABLE note.note_embeddings
(
    id         UUID PRIMARY KEY,
    note_id    UUID        NOT NULL REFERENCES note.notes (id) ON DELETE CASCADE,
    embedding  vector(384) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT
);

CREATE INDEX idx_note_embeddings_note_id ON note.note_embeddings (note_id);
