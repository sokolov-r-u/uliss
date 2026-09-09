package io.uliss.note_service.dto

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import java.time.Instant
import java.util.UUID

data class ChatSummaryResponse(
    val noteId: UUID,
    val chatId: UUID,
    val status: NoteStatus,
    val createdAt: Instant?,
)

fun NoteEntity.toChatSummaryResponse(chatId: UUID) = ChatSummaryResponse(id, chatId, status, createdAt)
