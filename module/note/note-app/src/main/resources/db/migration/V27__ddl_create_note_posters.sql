-- A note's poster in its own table: the https link the browser loads and where its two crop frames sit (PosterCrop
-- JSON, fractions of the image; null = centred defaults). Moves note.notes.poster_url here.
CREATE TABLE note.note_posters
(
    note_id UUID PRIMARY KEY REFERENCES note.notes (id) ON DELETE CASCADE,
    url     VARCHAR(2048) NOT NULL,
    crop    JSONB
);

INSERT INTO note.note_posters (note_id, url)
SELECT id, poster_url
FROM note.notes
WHERE poster_url IS NOT NULL;

ALTER TABLE note.notes
    DROP COLUMN poster_url;
