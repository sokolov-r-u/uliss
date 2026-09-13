package io.uliss.note_service.model

import java.time.Instant
import java.util.UUID

enum class ChatTurnStatus {
    GENERATING,
    COMPLETE,
    PARTIAL,
    FAILED,
    CANCELED,
}

/** Database-backed lifecycle for one user intent and its assistant result. */
data class ChatTurn(
    val id: UUID,
    val userId: UUID,
    val chatId: UUID,
    val requestFingerprint: ByteArray,
    val status: ChatTurnStatus,
    val attempt: Int,
    val leaseUntil: Instant?,
    val retryAfterMs: Long,
)
