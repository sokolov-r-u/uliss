-- The note version an index was built from: an index event that read older text must not overwrite it.
ALTER TABLE note.rag_chunks
    ADD COLUMN content_version bigint NOT NULL DEFAULT 0;
