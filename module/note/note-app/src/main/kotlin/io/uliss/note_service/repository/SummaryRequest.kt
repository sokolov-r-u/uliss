package io.uliss.note_service.repository

import io.uliss.note_service.model.SummaryRequestStatus
import java.time.Instant
import java.util.UUID

data class SummaryRequest(
    val userId: UUID,
    val idempotencyKey: UUID,
    val chatId: UUID,
    val throughMessageId: UUID,
    val noteId: UUID,
    val createdAt: Instant,
    val status: SummaryRequestStatus = SummaryRequestStatus.PENDING,
)
