package io.uliss.note_service.dto

import java.time.Instant
import java.util.UUID

data class ChatResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant?,
    val updatedAt: Instant?,
)
