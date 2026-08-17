package io.uliss.note_service.dto

import io.uliss.note_service.model.ChatEntity
import java.time.Instant
import java.util.UUID

data class ChatResponse(
    val id: UUID,
    val title: String,
    val createdAt: Instant?,
    val updatedAt: Instant?,
)

fun ChatEntity.toResponse() = ChatResponse(id, title, createdAt, updatedAt)
