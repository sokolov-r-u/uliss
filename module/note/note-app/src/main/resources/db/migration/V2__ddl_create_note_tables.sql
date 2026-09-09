CREATE EXTENSION IF NOT EXISTS vector;

-- Main notes table: plain user records. created_by/updated_by = user profile id or 'SYSTEM'.
CREATE TABLE note.notes
(
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL,
    -- Generated summaries start without content and become READY only after the background worker finishes.
    content TEXT,
    status  VARCHAR(16) NOT NULL DEFAULT 'READY' CHECK (status IN ('GENERATING', 'READY', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    CONSTRAINT uq_notes_id_user_id UNIQUE (id, user_id)
);

CREATE INDEX idx_notes_user_id ON note.notes (user_id);
