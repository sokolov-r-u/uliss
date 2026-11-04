package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ChatWithNoteCount
import java.time.Instant
import java.util.UUID

data class ChatResponse(
    val id: UUID,
    val title: String,
    val noteCount: Int,
    val createdAt: Instant?,
    val updatedAt: Instant?,
    /** When the user pinned it; null for an unpinned chat. */
    val pinnedAt: Instant? = null,
)

fun ChatWithNoteCount.toResponse() = ChatResponse(chat.id, chat.title, noteCount, chat.createdAt, chat.updatedAt, chat.pinnedAt)
