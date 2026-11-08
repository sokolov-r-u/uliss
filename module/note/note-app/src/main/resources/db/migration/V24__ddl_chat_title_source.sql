-- Where the chat title came from: the first message (until replaced), the model, or the user.
-- Only a FIRST_MESSAGE title takes a generated one, so a user's rename always wins.
ALTER TABLE note.chat
    ADD COLUMN title_source VARCHAR(16) NOT NULL DEFAULT 'FIRST_MESSAGE'
        CONSTRAINT chk_chat_title_source CHECK (title_source IN ('FIRST_MESSAGE', 'GENERATED', 'USER'));
