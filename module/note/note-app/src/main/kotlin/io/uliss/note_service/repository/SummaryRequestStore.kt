package io.uliss.note_service.repository

import io.uliss.note_service.exception.SummaryInProgressException
import io.uliss.note_service.model.SummaryRequestStatus
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class SummaryRequestStore(
    private val jdbcTemplate: JdbcTemplate,
) {

    fun reserve(
        userId: UUID,
        idempotencyKey: UUID,
        chatId: UUID,
        throughMessageId: UUID,
        noteId: UUID,
    ): SummaryRequest? = try {
        jdbcTemplate.query(
            RESERVE_SQL,
            ::mapRequest,
            userId,
            idempotencyKey,
            chatId,
            throughMessageId,
            noteId,
        ).singleOrNull()
    } catch (exception: DuplicateKeyException) {
        // ON CONFLICT covers only key replays; another pending request of the chat violates the partial index.
        if (exception.mostSpecificCause.message?.contains(PENDING_CHAT_INDEX) == true) {
            throw SummaryInProgressException(chatId)
        }
        throw exception
    }

    fun find(userId: UUID, idempotencyKey: UUID): SummaryRequest? =
        jdbcTemplate.query(FIND_SQL, ::mapRequest, userId, idempotencyKey).singleOrNull()

    /** Moves the request out of PENDING; null when it is missing or already finished. */
    fun finish(userId: UUID, idempotencyKey: UUID, status: SummaryRequestStatus): SummaryRequest? =
        jdbcTemplate.query(FINISH_BY_KEY_SQL, ::mapRequest, status.name, userId, idempotencyKey).singleOrNull()

    fun hasPendingForNote(noteId: UUID): Boolean =
        jdbcTemplate.queryForObject(HAS_PENDING_FOR_NOTE_SQL, Boolean::class.java, noteId) == true

    /** Ids of the user's notes that have a PENDING request; empty when none. */
    fun findPendingNoteIds(userId: UUID): Set<UUID> =
        jdbcTemplate.queryForList(FIND_PENDING_NOTE_IDS_SQL, UUID::class.java, userId).filterNotNull().toSet()

    /** Moves the pending request of a note out of PENDING; null when none is pending. */
    fun finishPendingForNote(noteId: UUID, status: SummaryRequestStatus): SummaryRequest? =
        jdbcTemplate.query(FINISH_BY_NOTE_SQL, ::mapRequest, status.name, noteId).singleOrNull()

    private fun mapRequest(
        resultSet: ResultSet,
        @Suppress("UNUSED_PARAMETER") rowNumber: Int,
    ): SummaryRequest = SummaryRequest(
        userId = resultSet.getObject("user_id", UUID::class.java),
        idempotencyKey = resultSet.getObject("idempotency_key", UUID::class.java),
        chatId = resultSet.getObject("chat_id", UUID::class.java),
        throughMessageId = resultSet.getObject("through_message_id", UUID::class.java),
        noteId = resultSet.getObject("note_id", UUID::class.java),
        createdAt = resultSet.getTimestamp("created_at").toInstant(),
        status = SummaryRequestStatus.valueOf(resultSet.getString("status")),
    )

    private companion object {
        const val PENDING_CHAT_INDEX = "uq_summary_request_pending_chat"

        const val REQUEST_COLUMNS = """
            user_id, idempotency_key, chat_id, through_message_id, note_id, created_at, status
        """

        const val RESERVE_SQL = """
            INSERT INTO note.summary_request
                (user_id, idempotency_key, chat_id, through_message_id, note_id, status,
                 created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
            RETURNING $REQUEST_COLUMNS
        """

        const val FIND_SQL = """
            SELECT $REQUEST_COLUMNS
            FROM note.summary_request
            WHERE user_id = ? AND idempotency_key = ?
        """

        const val FINISH_BY_KEY_SQL = """
            UPDATE note.summary_request
            SET status = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE user_id = ? AND idempotency_key = ? AND status = 'PENDING'
            RETURNING $REQUEST_COLUMNS
        """

        const val HAS_PENDING_FOR_NOTE_SQL = """
            SELECT EXISTS (SELECT 1 FROM note.summary_request WHERE note_id = ? AND status = 'PENDING')
        """

        const val FIND_PENDING_NOTE_IDS_SQL = """
            SELECT note_id FROM note.summary_request WHERE user_id = ? AND status = 'PENDING'
        """

        const val FINISH_BY_NOTE_SQL = """
            UPDATE note.summary_request
            SET status = ?, updated_at = CURRENT_TIMESTAMP, version = version + 1
            WHERE note_id = ? AND status = 'PENDING'
            RETURNING $REQUEST_COLUMNS
        """
    }
}
