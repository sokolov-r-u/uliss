-- Tree and sky views read a user's memberships; the primary key and the constellation index cannot serve that.
CREATE INDEX idx_note_constellation_user_id ON note.note_constellation (user_id, constellation_id);
