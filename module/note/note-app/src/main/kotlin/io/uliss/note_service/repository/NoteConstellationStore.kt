package io.uliss.note_service.repository

import io.uliss.note_service.model.projection.ConstellationNoteCount
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.util.NotePlacement
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.sql.Timestamp
import java.util.UUID

/** Note memberships in constellations (`note_constellation`); every read is filtered by the owner. */
@Repository
class NoteConstellationStore(private val jdbcTemplate: JdbcTemplate) {

    /** The note's memberships, main first, then by added time; empty for a note of another user. */
    fun findByNote(userId: UUID, noteId: UUID): List<NoteMembership> =
        NotePlacement.ordered(jdbcTemplate.query(FIND_BY_NOTE_SQL, { rs, _ -> mapMembership(rs) }, noteId, userId))

    /** The memberships of each of [noteIds], main first; notes without a place are absent. */
    fun findByNotes(userId: UUID, noteIds: Collection<UUID>): Map<UUID, List<NoteMembership>> {
        if (noteIds.isEmpty()) return emptyMap()
        val rows = jdbcTemplate.query(
            FIND_BY_NOTES_SQL,
            { rs, _ -> rs.getObject("note_id", UUID::class.java) to mapMembership(rs) },
            noteIds.toTypedArray(),
            userId,
        )
        return rows.groupBy({ it.first }, { it.second }).mapValues { NotePlacement.ordered(it.value) }
    }

    /** Every membership of the notes that belong to any of [constellationIds], keyed by note id. */
    fun findByNotesInConstellations(
        userId: UUID,
        constellationIds: Collection<UUID>,
    ): Map<UUID, List<NoteMembership>> {
        if (constellationIds.isEmpty()) return emptyMap()
        val rows = jdbcTemplate.query(
            FIND_BY_NOTES_IN_CONSTELLATIONS_SQL,
            { rs, _ -> rs.getObject("note_id", UUID::class.java) to mapMembership(rs) },
            userId,
            constellationIds.toTypedArray(),
            userId,
        )
        return rows.groupBy({ it.first }, { it.second }).mapValues { NotePlacement.ordered(it.value) }
    }

    /**
     * Replaces the whole membership set of each note. The old rows go first, so the one-main index never sees two
     * mains. Callers pass owned notes and constellations and hold the user's tree lock.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun replace(userId: UUID, byNote: Map<UUID, List<NoteMembership>>) {
        if (byNote.isEmpty()) return
        jdbcTemplate.update(DELETE_BY_NOTES_SQL, byNote.keys.toTypedArray(), userId)
        val rows = byNote.flatMap { (noteId, memberships) -> memberships.map { noteId to it } }
        jdbcTemplate.batchUpdate(INSERT_SQL, rows, rows.size.coerceAtLeast(1)) { statement, (noteId, membership) ->
            statement.setObject(1, noteId)
            statement.setObject(2, membership.constellationId)
            statement.setObject(3, userId)
            statement.setBoolean(4, membership.main)
            statement.setTimestamp(5, Timestamp.from(membership.addedAt))
        }
    }

    /**
     * Note counts of every constellation of the user that holds notes in its subtree, sub-notes included (they live
     * where their top note lives); empty ones are absent.
     */
    fun countNotes(userId: UUID): List<ConstellationNoteCount> =
        jdbcTemplate.query(
            COUNT_NOTES_SQL,
            { rs, _ ->
                ConstellationNoteCount(
                    constellationId = rs.getObject("constellation_id", UUID::class.java),
                    noteCount = rs.getInt("note_count"),
                    ownNoteCount = rs.getInt("own_note_count"),
                )
            },
            userId,
            userId,
            userId,
            userId,
        )

    private fun mapMembership(rs: ResultSet) = NoteMembership(
        constellationId = rs.getObject("constellation_id", UUID::class.java),
        main = rs.getBoolean("is_main"),
        addedAt = rs.getTimestamp("added_at").toInstant(),
    )

    private companion object {
        const val FIND_BY_NOTE_SQL = """
            SELECT constellation_id, is_main, added_at
            FROM note.note_constellation
            WHERE note_id = ? AND user_id = ?
        """

        const val FIND_BY_NOTES_SQL = """
            SELECT note_id, constellation_id, is_main, added_at
            FROM note.note_constellation
            WHERE note_id = ANY (?) AND user_id = ?
        """

        const val FIND_BY_NOTES_IN_CONSTELLATIONS_SQL = """
            SELECT note_id, constellation_id, is_main, added_at
            FROM note.note_constellation
            WHERE note_id IN (SELECT note_id
                              FROM note.note_constellation
                              WHERE user_id = ? AND constellation_id = ANY (?))
              AND user_id = ?
        """

        const val DELETE_BY_NOTES_SQL = """
            DELETE FROM note.note_constellation
            WHERE note_id = ANY (?) AND user_id = ?
        """

        const val INSERT_SQL = """
            INSERT INTO note.note_constellation (note_id, constellation_id, user_id, is_main, added_at)
            VALUES (?, ?, ?, ?, ?)
        """

        // Placed notes are the memberships plus every sub-note of a placed note with the same constellation (UNION
        // stops even on corrupted cyclic data). Every constellation is paired with itself and each of its ancestors;
        // a note counts once per ancestor.
        const val COUNT_NOTES_SQL = """
            WITH RECURSIVE placed AS (
                SELECT note_id, constellation_id
                FROM note.note_constellation
                WHERE user_id = ?
                UNION
                SELECT n.id, p.constellation_id
                FROM placed p
                         JOIN note.notes n ON n.parent_note_id = p.note_id
                WHERE n.user_id = ?
            ),
            ancestry AS (
                SELECT id, id AS ancestor_id, parent_id
                FROM note.constellations
                WHERE user_id = ?
                UNION ALL
                SELECT a.id, c.id, c.parent_id
                FROM ancestry a
                         JOIN note.constellations c ON c.id = a.parent_id
                WHERE c.user_id = ?
            )
            SELECT a.ancestor_id                                                 AS constellation_id,
                   COUNT(DISTINCT p.note_id)                                     AS note_count,
                   COUNT(DISTINCT p.note_id) FILTER (WHERE a.id = a.ancestor_id) AS own_note_count
            FROM ancestry a
                     JOIN placed p ON p.constellation_id = a.id
            GROUP BY a.ancestor_id
        """
    }
}
