-- The user's emoji for a note: one grapheme (NoteIconNormalizer); null when the note has none.
ALTER TABLE note.notes
    ADD COLUMN icon VARCHAR(32);
