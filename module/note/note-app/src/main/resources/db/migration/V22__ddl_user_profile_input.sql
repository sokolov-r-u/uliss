-- What the user tells the profile themselves: a self-description and rules for how the profile is written.
CREATE TABLE note.user_profile_input
(
    id            UUID PRIMARY KEY,
    user_id       UUID        NOT NULL UNIQUE,
    about         TEXT,
    rules         TEXT[]      NOT NULL DEFAULT '{}',
    rules_version INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    version       BIGINT,
    created_by    VARCHAR(64) NOT NULL,
    updated_by    VARCHAR(64) NOT NULL
);

-- The rules version the profile text (or the rebuild draft) was written under, and the one applying them failed on.
ALTER TABLE note.user_profile
    ADD COLUMN rules_version        INT NOT NULL DEFAULT 0,
    ADD COLUMN rules_failed_version INT;
ALTER TABLE note.user_profile_rebuild
    ADD COLUMN rules_version INT NOT NULL DEFAULT 0;
