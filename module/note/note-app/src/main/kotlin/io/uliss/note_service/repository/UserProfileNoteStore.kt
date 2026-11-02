package io.uliss.note_service.repository

import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.model.projection.ProfileNote
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/**
 * Reads the notes the user profile is built from: the owner's READY notes in `(updated_at, id)` order. Only notes
 * changed before `settledBefore` count, so a transaction that commits a slightly older `updated_at` after a run is
 * not skipped by its mark.
 */
@Repository
class UserProfileNoteStore(private val jdbcTemplate: JdbcTemplate) {

    /** Users with a settled READY note their profile has not read yet; a user with notes and no profile counts. */
    fun findUsersToRefresh(settledBefore: Instant): List<UUID> =
        jdbcTemplate.query(
            FIND_USERS_TO_REFRESH_SQL,
            { rs, _ -> rs.getObject(1, UUID::class.java) },
            Timestamp.from(settledBefore),
        )

    /** Up to [limit] notes after [after] (from the first note when null). */
    fun findNotesAfter(userId: UUID, after: NotesMark?, settledBefore: Instant, limit: Int): List<ProfileNote> {
        val markAt = Timestamp.from(after?.updatedAt ?: Instant.EPOCH)
        val markId = after?.noteId ?: NIL_UUID
        return jdbcTemplate.query(
            FIND_NOTES_AFTER_SQL,
            { rs, _ ->
                ProfileNote(
                    id = rs.getObject("id", UUID::class.java),
                    title = rs.getString("title"),
                    content = rs.getString("content"),
                    updatedAt = rs.getTimestamp("updated_at").toInstant(),
                )
            },
            userId,
            Timestamp.from(settledBefore),
            markAt,
            markId,
            limit,
        )
    }

    /**
     * Stamps the profile with [deletedAt] when any of [noteIds] existed when the profile, or the draft of its running
     * rebuild, last read a note: what it read of them may be in the text. Runs before the delete, in its transaction.
     */
    fun markDeleted(userId: UUID, noteIds: Collection<UUID>, deletedAt: Instant) {
        jdbcTemplate.update(MARK_DELETED_SQL, Timestamp.from(deletedAt), userId, noteIds.toTypedArray(), userId)
    }

    private companion object {
        val NIL_UUID = UUID(0, 0)

        const val FIND_USERS_TO_REFRESH_SQL = """
            SELECT DISTINCT n.user_id
            FROM note.notes n
                     LEFT JOIN note.user_profile p ON p.user_id = n.user_id
            WHERE n.status = 'READY'
              AND n.updated_at < ?
              AND (p.user_id IS NULL OR (n.updated_at, n.id) > (p.notes_through_at, p.notes_through_id))
        """

        // created_at, not updated_at: a note read and then edited past the mark still left its old text in the profile
        const val MARK_DELETED_SQL = """
            UPDATE note.user_profile p
            SET last_deletion_at = ?
            WHERE p.user_id = ?
              AND EXISTS (SELECT 1
                          FROM note.notes n
                          WHERE n.id = ANY (?)
                            AND n.user_id = ?
                            AND (n.created_at <= p.notes_through_at
                              OR EXISTS (SELECT 1
                                         FROM note.user_profile_rebuild r
                                         WHERE r.user_id = p.user_id
                                           AND r.status = 'RUNNING'
                                           AND n.created_at <= r.through_at)))
        """

        const val FIND_NOTES_AFTER_SQL = """
            SELECT id, title, coalesce(content, '') AS content, updated_at
            FROM note.notes
            WHERE user_id = ?
              AND status = 'READY'
              AND updated_at < ?
              AND (updated_at, id) > (?, ?)
            ORDER BY updated_at, id
            LIMIT ?
        """
    }
}
