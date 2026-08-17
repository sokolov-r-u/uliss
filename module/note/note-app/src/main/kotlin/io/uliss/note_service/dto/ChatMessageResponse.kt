package io.uliss.note_service.dto

import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import java.time.Instant
import java.util.UUID

data class ChatMessageResponse(
    val id: UUID,
    val role: ChatMessageRole,
    val status: ChatMessageStatus,
    val content: String,
    val createdAt: Instant?,
)
