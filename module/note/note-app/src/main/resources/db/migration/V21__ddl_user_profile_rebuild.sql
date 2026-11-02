-- A profile row may hold no text yet: it still carries the mark, the batch shrink and the deletion flag.
ALTER TABLE note.user_profile
    ALTER COLUMN content DROP NOT NULL,
    ALTER COLUMN notes_through_at DROP NOT NULL,
    ALTER COLUMN notes_through_id DROP NOT NULL,
    ADD COLUMN last_deletion_at TIMESTAMPTZ,
    ADD COLUMN batch_shrink     INT NOT NULL DEFAULT 0;

-- Full rebuilds of the profile: a log for the rebuild limit, and the draft a running rebuild writes.
CREATE TABLE note.user_profile_rebuild
(
    id           UUID PRIMARY KEY,
    user_id      UUID        NOT NULL,
    trigger      VARCHAR(16) NOT NULL CHECK (trigger IN ('USER', 'DELETIONS')),
    status       VARCHAR(16) NOT NULL CHECK (status IN ('RUNNING', 'DONE')),
    content      TEXT,
    through_at   TIMESTAMPTZ,
    through_id   UUID,
    batch_shrink INT         NOT NULL DEFAULT 0,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL,
    version      BIGINT,
    created_by   VARCHAR(64) NOT NULL,
    updated_by   VARCHAR(64) NOT NULL
);

-- At most one running rebuild per user.
CREATE UNIQUE INDEX uq_user_profile_rebuild_running ON note.user_profile_rebuild (user_id) WHERE status = 'RUNNING';
-- The rebuild limit counts one user's runs of one trigger in a time window.
CREATE INDEX idx_user_profile_rebuild_user_trigger ON note.user_profile_rebuild (user_id, trigger, created_at);
