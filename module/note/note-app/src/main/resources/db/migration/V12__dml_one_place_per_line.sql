-- A note keeps at most one place on each root-to-leaf line. Existing memberships that break it lose the ancestor
-- place; a lost main passes to the oldest remaining descendant place of the same note.
CREATE TEMPORARY TABLE constellation_ancestry ON COMMIT DROP AS
WITH RECURSIVE ancestry AS (
    SELECT id, parent_id AS ancestor_id
    FROM note.constellations
    WHERE parent_id IS NOT NULL
    UNION ALL
    SELECT a.id, c.parent_id
    FROM ancestry a
             JOIN note.constellations c ON c.id = a.ancestor_id
    WHERE c.parent_id IS NOT NULL
)
SELECT id, ancestor_id
FROM ancestry;

CREATE TEMPORARY TABLE dropped_memberships ON COMMIT DROP AS
SELECT DISTINCT above.note_id, above.constellation_id, above.is_main
FROM note.note_constellation above
         JOIN note.note_constellation below ON below.note_id = above.note_id
         JOIN constellation_ancestry a ON a.id = below.constellation_id AND a.ancestor_id = above.constellation_id;

-- The old rows go first, so the one-main index never sees two mains.
DELETE
FROM note.note_constellation nc
    USING dropped_memberships d
WHERE nc.note_id = d.note_id
  AND nc.constellation_id = d.constellation_id;

UPDATE note.note_constellation nc
SET is_main = TRUE
FROM (SELECT DISTINCT ON (kept.note_id) kept.note_id, kept.constellation_id
      FROM note.note_constellation kept
               JOIN dropped_memberships d ON d.note_id = kept.note_id AND d.is_main
               JOIN constellation_ancestry a ON a.id = kept.constellation_id AND a.ancestor_id = d.constellation_id
      ORDER BY kept.note_id, kept.added_at, kept.constellation_id) heir
WHERE nc.note_id = heir.note_id
  AND nc.constellation_id = heir.constellation_id;
