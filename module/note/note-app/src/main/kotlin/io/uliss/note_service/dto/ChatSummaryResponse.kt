package io.uliss.note_service.dto

import io.uliss.note_service.model.NoteEntity
import java.time.Instant
import java.util.UUID

data class ChatSummaryResponse(
    val noteId: UUID,
    val content: String?,
    val createdAt: Instant?,
)

fun NoteEntity.toChatSummaryResponse() = ChatSummaryResponse(id, content, createdAt)
