-- A link must join a chat and a note of the same user, like every other cross-table reference in this schema.
ALTER TABLE note.chat_note ADD COLUMN user_id UUID;

UPDATE note.chat_note cn
SET user_id = c.user_id
FROM note.chat c
WHERE c.id = cn.chat_id;

-- a link across users is corrupt data: no code path creates one
DELETE FROM note.chat_note cn
USING note.notes n
WHERE n.id = cn.note_id
  AND n.user_id <> cn.user_id;

ALTER TABLE note.chat_note
    ALTER COLUMN user_id SET NOT NULL,
    ADD CONSTRAINT fk_chat_note_chat_owner
        FOREIGN KEY (chat_id, user_id) REFERENCES note.chat (id, user_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_chat_note_note_owner
        FOREIGN KEY (note_id, user_id) REFERENCES note.notes (id, user_id) ON DELETE CASCADE;
