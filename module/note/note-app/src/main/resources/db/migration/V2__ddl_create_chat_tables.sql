-- Chat sessions: one user has many chats, each chat has an ordered list of messages.
CREATE TABLE note.chat
(
    id         UUID PRIMARY KEY,
    user_id    UUID         NOT NULL,
    title      VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL,
    updated_at TIMESTAMPTZ  NOT NULL,
    version    BIGINT,
    created_by VARCHAR(64)  NOT NULL,
    updated_by VARCHAR(64)  NOT NULL
);

CREATE INDEX idx_chat_user_id ON note.chat (user_id);

-- status is meaningful for ASSISTANT messages (COMPLETE/PARTIAL/FAILED, see ChatMessageStatus);
-- USER messages are always COMPLETE (persisted synchronously before the DeepSeek call starts).
-- Empty content is expected and allowed for FAILED assistant messages.
CREATE TABLE note.chat_message
(
    id         UUID PRIMARY KEY,
    chat_id    UUID        NOT NULL REFERENCES note.chat (id) ON DELETE CASCADE,
    role       VARCHAR(16) NOT NULL,
    status     VARCHAR(16) NOT NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    CHECK (role IN ('USER', 'ASSISTANT')),
    CHECK (status IN ('COMPLETE', 'PARTIAL', 'FAILED'))
);

-- ordered-history reads (full conversation replay to DeepSeek on every turn).
CREATE INDEX idx_chat_message_chat_id_created_at ON note.chat_message (chat_id, created_at);

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
