package io.uliss.note_service.repository

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

data class SummaryRequest(
    val userId: UUID,
    val idempotencyKey: UUID,
    val chatId: UUID,
    val throughMessageId: UUID,
    val noteId: UUID,
    val createdAt: Instant,
)

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
    ): SummaryRequest? = jdbcTemplate.query(
        RESERVE_SQL,
        ::mapRequest,
        userId,
        idempotencyKey,
        chatId,
        throughMessageId,
        noteId,
    ).singleOrNull()

    fun find(userId: UUID, idempotencyKey: UUID): SummaryRequest? =
        jdbcTemplate.query(FIND_SQL, ::mapRequest, userId, idempotencyKey).singleOrNull()

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
    )

    private companion object {
        const val REQUEST_COLUMNS = """
            user_id, idempotency_key, chat_id, through_message_id, note_id, created_at
        """

        const val RESERVE_SQL = """
            INSERT INTO note.summary_request
                (user_id, idempotency_key, chat_id, through_message_id, note_id,
                 created_at, updated_at, version)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
            RETURNING $REQUEST_COLUMNS
        """

        const val FIND_SQL = """
            SELECT $REQUEST_COLUMNS
            FROM note.summary_request
            WHERE user_id = ? AND idempotency_key = ?
        """
    }
}
