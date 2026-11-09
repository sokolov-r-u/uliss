-- The note poster: an https link the browser loads (PosterUrlNormalizer); the server never fetches it. Null when none.
ALTER TABLE note.notes
    ADD COLUMN poster_url VARCHAR(2048);
