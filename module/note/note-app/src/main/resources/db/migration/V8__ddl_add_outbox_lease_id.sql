-- Fencing token of the current claim; completion and failure apply only while it still matches.
ALTER TABLE note.outbox_event
    ADD COLUMN lease_id UUID;
