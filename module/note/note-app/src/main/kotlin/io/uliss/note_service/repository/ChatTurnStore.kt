package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatTurn
import io.uliss.note_service.model.ChatTurnStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class ChatTurnStore(
    private val jdbcTemplate: JdbcTemplate,
) {

    /** Serializes short turn reservations for one owned chat; no provider call holds this lock. */
    fun lockOwnedChat(userId: UUID, chatId: UUID): Boolean =
        jdbcTemplate.query(LOCK_OWNED_CHAT_SQL, { _, _ -> true }, chatId, userId).isNotEmpty()

    fun insert(
        turnId: UUID,
        userId: UUID,
        chatId: UUID,
        requestFingerprint: ByteArray,
        leaseMillis: Long,
    ): ChatTurn? {
        require(leaseMillis > 0) { "leaseMillis must be positive" }
        return jdbcTemplate.query(
            INSERT_SQL,
            ::mapTurn,
            turnId,
            userId,
            chatId,
            requestFingerprint,
            ChatTurnStatus.GENERATING.name,
            leaseMillis,
        ).singleOrNull()
    }

    fun findById(turnId: UUID): ChatTurn? =
        jdbcTemplate.query(FIND_BY_ID_SQL, ::mapTurn, turnId).singleOrNull()

    fun findGenerating(chatId: UUID): ChatTurn? =
        jdbcTemplate.query(
            FIND_GENERATING_SQL,
            ::mapTurn,
            chatId,
            ChatTurnStatus.GENERATING.name,
        ).singleOrNull()

    fun claimExpired(turnId: UUID, expectedAttempt: Int, maxAttempts: Int, leaseMillis: Long): ChatTurn? {
        require(maxAttempts > 0) { "maxAttempts must be positive" }
        require(leaseMillis > 0) { "leaseMillis must be positive" }
        return jdbcTemplate.query(
            CLAIM_EXPIRED_SQL,
            ::mapTurn,
            leaseMillis,
            turnId,
            ChatTurnStatus.GENERATING.name,
            expectedAttempt,
            maxAttempts,
        ).singleOrNull()
    }

    fun transitionToTerminal(
        turnId: UUID,
        attempt: Int,
        status: ChatTurnStatus,
    ): Boolean {
        require(status != ChatTurnStatus.GENERATING) { "terminal status required" }
        return jdbcTemplate.query(
            TRANSITION_TO_TERMINAL_SQL,
            { _, _ -> true },
            status.name,
            turnId,
            attempt,
            ChatTurnStatus.GENERATING.name,
        ).isNotEmpty()
    }

    fun failExpiredAtAttemptLimit(turnId: UUID, maxAttempts: Int): Boolean =
        jdbcTemplate.query(
            FAIL_EXPIRED_AT_LIMIT_SQL,
            { _, _ -> true },
            ChatTurnStatus.FAILED.name,
            turnId,
            ChatTurnStatus.GENERATING.name,
            maxAttempts,
        ).isNotEmpty()

    fun cancelGenerating(turnId: UUID, userId: UUID, chatId: UUID): Boolean =
        jdbcTemplate.query(
            CANCEL_GENERATING_SQL,
            { _, _ -> true },
            ChatTurnStatus.CANCELED.name,
            turnId,
            userId,
            chatId,
            ChatTurnStatus.GENERATING.name,
        ).isNotEmpty()

    private fun mapTurn(resultSet: ResultSet, @Suppress("UNUSED_PARAMETER") rowNumber: Int): ChatTurn =
        ChatTurn(
            id = resultSet.getObject("id", UUID::class.java),
            userId = resultSet.getObject("user_id", UUID::class.java),
            chatId = resultSet.getObject("chat_id", UUID::class.java),
            requestFingerprint = resultSet.getBytes("request_fingerprint"),
            status = ChatTurnStatus.valueOf(resultSet.getString("status")),
            attempt = resultSet.getInt("attempt"),
            leaseUntil = resultSet.getTimestamp("lease_until")?.toInstant(),
            retryAfterMs = resultSet.getLong("retry_after_ms"),
        )

    private companion object {
        const val TURN_COLUMNS = """
            id, user_id, chat_id, request_fingerprint, status, attempt, lease_until,
            GREATEST(
                0,
                CEIL(EXTRACT(EPOCH FROM (lease_until - CURRENT_TIMESTAMP)) * 1000)
            )::BIGINT AS retry_after_ms
        """

        const val LOCK_OWNED_CHAT_SQL = """
            SELECT id
            FROM note.chat
            WHERE id = ? AND user_id = ?
            FOR UPDATE
        """

        const val INSERT_SQL = """
            INSERT INTO note.chat_turn
                (id, user_id, chat_id, request_fingerprint, status, attempt, lease_until,
                 created_at, updated_at, version)
            VALUES
                (?, ?, ?, ?, ?, 1,
                 CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond'),
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
            ON CONFLICT DO NOTHING
            RETURNING $TURN_COLUMNS
        """

        const val FIND_BY_ID_SQL = """
            SELECT $TURN_COLUMNS
            FROM note.chat_turn
            WHERE id = ?
        """

        const val FIND_GENERATING_SQL = """
            SELECT $TURN_COLUMNS
            FROM note.chat_turn
            WHERE chat_id = ? AND status = ?
        """

        const val CLAIM_EXPIRED_SQL = """
            UPDATE note.chat_turn
            SET attempt = attempt + 1,
                lease_until = CURRENT_TIMESTAMP + (? * INTERVAL '1 millisecond'),
                updated_at = CURRENT_TIMESTAMP,
                version = COALESCE(version, 0) + 1
            WHERE id = ?
              AND status = ?
              AND attempt = ?
              AND attempt < ?
              AND lease_until <= CURRENT_TIMESTAMP
            RETURNING $TURN_COLUMNS
        """

        const val TRANSITION_TO_TERMINAL_SQL = """
            UPDATE note.chat_turn
            SET status = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP,
                version = COALESCE(version, 0) + 1
            WHERE id = ? AND attempt = ? AND status = ?
            RETURNING id
        """

        const val FAIL_EXPIRED_AT_LIMIT_SQL = """
            UPDATE note.chat_turn
            SET status = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP,
                version = COALESCE(version, 0) + 1
            WHERE id = ?
              AND status = ?
              AND attempt >= ?
              AND lease_until <= CURRENT_TIMESTAMP
            RETURNING id
        """

        const val CANCEL_GENERATING_SQL = """
            UPDATE note.chat_turn
            SET status = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP,
                version = COALESCE(version, 0) + 1
            WHERE id = ? AND user_id = ? AND chat_id = ? AND status = ?
            RETURNING id
        """
    }
}
