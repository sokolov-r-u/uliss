-- The user's tree of constellations. Colour belongs to a root (hue); sub-constellations inherit the root's hue and
-- pick a lightness step. The composite parent FK keeps a parent within the same user.
CREATE TABLE note.constellations
(
    id         UUID PRIMARY KEY,
    user_id    UUID        NOT NULL,
    parent_id  UUID,
    name       VARCHAR(40) NOT NULL,
    hue        SMALLINT,
    lightness  VARCHAR(8),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version    BIGINT,
    created_by VARCHAR(64) NOT NULL,
    updated_by VARCHAR(64) NOT NULL,
    CONSTRAINT uq_constellations_id_user_id UNIQUE (id, user_id),
    CONSTRAINT fk_constellations_parent
        FOREIGN KEY (parent_id, user_id) REFERENCES note.constellations (id, user_id),
    CONSTRAINT chk_constellations_not_own_parent CHECK (parent_id <> id),
    CONSTRAINT chk_constellations_colour CHECK (
        (parent_id IS NULL AND hue IS NOT NULL AND hue BETWEEN 0 AND 359 AND lightness IS NULL)
            OR (parent_id IS NOT NULL AND hue IS NULL AND lightness IS NOT NULL
            AND lightness IN ('DEEP', 'BASE', 'LIGHT', 'PALE'))
        )
);

-- One rule for roots (parent_id NULL) and siblings: names are unique regardless of case.
CREATE UNIQUE INDEX uq_constellations_user_parent_name
    ON note.constellations (user_id, parent_id, lower(name)) NULLS NOT DISTINCT;
CREATE INDEX idx_constellations_parent_id ON note.constellations (parent_id);

-- Note memberships, at most one main per note. Removing a constellation's memberships is the service's job, so the
-- constellation FK does not cascade.
CREATE TABLE note.note_constellation
(
    note_id          UUID        NOT NULL,
    constellation_id UUID        NOT NULL,
    user_id          UUID        NOT NULL,
    is_main          BOOLEAN     NOT NULL,
    added_at         TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_note_constellation PRIMARY KEY (note_id, constellation_id),
    CONSTRAINT fk_note_constellation_note
        FOREIGN KEY (note_id, user_id) REFERENCES note.notes (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_note_constellation_constellation
        FOREIGN KEY (constellation_id, user_id) REFERENCES note.constellations (id, user_id)
);

CREATE UNIQUE INDEX uq_note_constellation_main ON note.note_constellation (note_id) WHERE is_main;
CREATE INDEX idx_note_constellation_constellation_id ON note.note_constellation (constellation_id);

-- A sub-note lives where its parent note lives.
ALTER TABLE note.notes
    ADD COLUMN parent_note_id UUID,
    ADD CONSTRAINT fk_notes_parent_note
        FOREIGN KEY (parent_note_id, user_id) REFERENCES note.notes (id, user_id),
    ADD CONSTRAINT chk_notes_not_own_parent CHECK (parent_note_id <> id);

CREATE INDEX idx_notes_parent_note_id ON note.notes (parent_note_id);
