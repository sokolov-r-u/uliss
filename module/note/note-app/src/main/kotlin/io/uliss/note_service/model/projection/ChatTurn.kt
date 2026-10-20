package io.uliss.note_service.model.projection

import java.time.Instant
import java.util.UUID

/** Database-backed lifecycle for one user intent and its assistant result. */
data class ChatTurn(
    val id: UUID,
    val userId: UUID,
    val chatId: UUID,
    val idempotencyKey: UUID,
    val requestFingerprint: RequestFingerprint,
    val status: ChatTurnStatus,
    val attempt: Int,
    val leaseUntil: Instant?,
    val retryAfterMs: Long,
)
