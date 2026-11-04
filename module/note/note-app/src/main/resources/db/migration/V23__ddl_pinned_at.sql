-- When the user pinned a chat or a note; null for an unpinned one. Written by plain UPDATEs that leave
-- updated_at and version alone, so pinning neither reorders the lists nor conflicts with an open edit.
ALTER TABLE note.chat
    ADD COLUMN pinned_at TIMESTAMPTZ;
ALTER TABLE note.notes
    ADD COLUMN pinned_at TIMESTAMPTZ;

-- The pinned lists: a few rows per user, read newest pin first.
CREATE INDEX idx_chat_user_pinned ON note.chat (user_id, pinned_at DESC, id DESC) WHERE pinned_at IS NOT NULL;
CREATE INDEX idx_notes_user_pinned ON note.notes (user_id, pinned_at DESC, id DESC) WHERE pinned_at IS NOT NULL;
