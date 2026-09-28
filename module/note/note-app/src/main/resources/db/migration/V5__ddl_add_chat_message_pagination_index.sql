CREATE INDEX idx_chat_message_chat_id_id
    ON note.chat_message (chat_id, id DESC);
