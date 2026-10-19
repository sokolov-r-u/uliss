package io.uliss.note_service.repository

import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.SkyNoteRow
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

/** Reads for the sky: every note of the user without its text, and every membership; filtered by the owner. */
@Repository
class SkyStore(private val jdbcTemplate: JdbcTemplate) {

    fun findNotes(userId: UUID): List<SkyNoteRow> =
        jdbcTemplate.query(
            FIND_NOTES_SQL,
            { rs, _ ->
                SkyNoteRow(
                    id = rs.getObject("id", UUID::class.java),
                    parentNoteId = rs.getObject("parent_note_id", UUID::class.java),
                    title = rs.getString("title"),
                    status = NoteStatus.valueOf(rs.getString("status")),
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                )
            },
            userId,
        )

    /** The memberships of every placed note, keyed by note id, in no particular order. */
    fun findMemberships(userId: UUID): Map<UUID, List<NoteMembership>> =
        jdbcTemplate.query(
            FIND_MEMBERSHIPS_SQL,
            { rs, _ ->
                rs.getObject("note_id", UUID::class.java) to NoteMembership(
                    constellationId = rs.getObject("constellation_id", UUID::class.java),
                    main = rs.getBoolean("is_main"),
                    addedAt = rs.getTimestamp("added_at").toInstant(),
                )
            },
            userId,
        ).groupBy({ it.first }, { it.second })

    private companion object {
        const val FIND_NOTES_SQL = """
            SELECT id, parent_note_id, title, status, created_at
            FROM note.notes
            WHERE user_id = ?
        """

        const val FIND_MEMBERSHIPS_SQL = """
            SELECT note_id, constellation_id, is_main, added_at
            FROM note.note_constellation
            WHERE user_id = ?
        """
    }
}
