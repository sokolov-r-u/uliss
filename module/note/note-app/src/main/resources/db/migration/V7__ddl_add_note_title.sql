-- Titles are at most 50 characters (TitleNormalizer). Shorten legacy chat titles so the narrowing cannot fail.
UPDATE note.chat
SET title = rtrim(left(title, 47)) || '...'
WHERE char_length(title) > 50;

ALTER TABLE note.chat
    ALTER COLUMN title TYPE VARCHAR(50);

-- Model-generated note title; nullable because earlier notes have none.
ALTER TABLE note.notes
    ADD COLUMN title VARCHAR(50);
