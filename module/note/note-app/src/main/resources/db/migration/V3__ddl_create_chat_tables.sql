-- Chat sessions: one user has many chats, each chat has an ordered list of messages.
CREATE TABLE note.chat
(
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL,
    title      VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    version BIGINT,
    CONSTRAINT uq_chat_id_user_id UNIQUE (id, user_id)
);

CREATE INDEX idx_chat_user_id ON note.chat (user_id);

-- A turn is one durable user intent and its eventual assistant result. The client-generated id
-- also acts as the idempotency key for retries of the streaming request.
CREATE TABLE note.chat_turn
(
    id                  UUID PRIMARY KEY,
    user_id             UUID        NOT NULL,
    chat_id             UUID        NOT NULL,
    request_fingerprint BYTEA       NOT NULL,
    status              VARCHAR(16) NOT NULL,
    attempt             INT         NOT NULL,
    lease_until         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,
    version             BIGINT,
    CONSTRAINT uq_chat_turn_id_chat_id UNIQUE (id, chat_id),
    CONSTRAINT fk_chat_turn_chat_owner
        FOREIGN KEY (chat_id, user_id) REFERENCES note.chat (id, user_id) ON DELETE CASCADE,
    CONSTRAINT ck_chat_turn_status
        CHECK (status IN ('GENERATING', 'COMPLETE', 'PARTIAL', 'FAILED', 'CANCELED')),
    CONSTRAINT ck_chat_turn_attempt CHECK (attempt >= 1),
    CONSTRAINT ck_chat_turn_lease
        CHECK ((status = 'GENERATING' AND lease_until IS NOT NULL)
            OR (status <> 'GENERATING' AND lease_until IS NULL))
);

-- PostgreSQL is the final single-flight authority across tabs and service instances.
CREATE UNIQUE INDEX uq_chat_turn_generating_chat
    ON note.chat_turn (chat_id)
    WHERE status = 'GENERATING';

-- status is meaningful for ASSISTANT messages (COMPLETE/PARTIAL/FAILED, see ChatMessageStatus);
-- USER messages are always COMPLETE (persisted synchronously before the DeepSeek call starts).
-- Empty content is expected and allowed for FAILED assistant messages.
CREATE TABLE note.chat_message
(
    id         UUID PRIMARY KEY,
    chat_id    UUID        NOT NULL REFERENCES note.chat (id) ON DELETE CASCADE,
    turn_id UUID,
    role       VARCHAR(16) NOT NULL,
    status     VARCHAR(16) NOT NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT,
    CONSTRAINT uq_chat_message_id_chat_id UNIQUE (id, chat_id),
    CONSTRAINT fk_chat_message_turn
        FOREIGN KEY (turn_id, chat_id) REFERENCES note.chat_turn (id, chat_id) ON DELETE CASCADE,
    CHECK (role IN ('USER', 'ASSISTANT')),
    CHECK (status IN ('COMPLETE', 'PARTIAL', 'FAILED', 'CANCELED'))
);

-- ordered-history reads (full conversation replay to DeepSeek on every turn).
CREATE INDEX idx_chat_message_chat_id_created_at ON note.chat_message (chat_id, created_at);

-- A turn owns at most one persisted message for each side of the conversation. Historical rows
-- remain valid with turn_id = NULL.
CREATE UNIQUE INDEX uq_chat_message_turn_role
    ON note.chat_message (turn_id, role)
    WHERE turn_id IS NOT NULL;

-- Scaffold for a future feature (chat summarization into notes); no logic uses this yet.
CREATE TABLE note.chat_note
(
    chat_id    UUID        NOT NULL REFERENCES note.chat (id) ON DELETE CASCADE,
    note_id    UUID        NOT NULL REFERENCES note.notes (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT,
    PRIMARY KEY (chat_id, note_id)
);

CREATE INDEX idx_chat_note_note_id ON note.chat_note (note_id);
