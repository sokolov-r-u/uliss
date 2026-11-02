-- One profile per user, compiled from their notes; (notes_through_at, notes_through_id) is the last note it read.
CREATE TABLE note.user_profile
(
    id               UUID PRIMARY KEY,
    user_id          UUID        NOT NULL UNIQUE,
    content          TEXT        NOT NULL,
    notes_through_at TIMESTAMPTZ NOT NULL,
    notes_through_id UUID        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL,
    version          BIGINT,
    created_by       VARCHAR(64) NOT NULL,
    updated_by       VARCHAR(64) NOT NULL
);

-- The profile batch reads one user's READY notes in (updated_at, id) order.
CREATE INDEX idx_notes_user_updated_id ON note.notes (user_id, updated_at, id);
