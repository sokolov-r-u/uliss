-- The chat's main summary note: Summarize updates it, and its link holds the chat's summary boundary.
ALTER TABLE note.chat_note
    ADD COLUMN main BOOLEAN NOT NULL DEFAULT FALSE;

-- The note Summarize would update today (the latest READY summary), else the summary still being written.
UPDATE note.chat_note cn
SET main = TRUE
WHERE cn.note_id = (SELECT n.id
                    FROM note.chat_note other
                             JOIN note.notes n ON n.id = other.note_id
                    WHERE other.chat_id = cn.chat_id
                      AND n.source = 'CHAT_SUMMARY'
                      AND n.status IN ('READY', 'GENERATING')
                    ORDER BY (n.status = 'READY') DESC, n.created_at DESC, n.id DESC
                    LIMIT 1);

CREATE UNIQUE INDEX uq_chat_note_main ON note.chat_note (chat_id) WHERE main;
