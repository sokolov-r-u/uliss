package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import java.util.UUID

data class ChatSummaryStateResponse(
    val throughMessageId: UUID?,
    val noteId: UUID,
    val noteTitle: String?,
)

data class ChatMessagePageResponse(
    val messages: List<ChatMessageResponse>,
    val nextCursor: UUID?,
    val hasMore: Boolean,
    val summary: ChatSummaryStateResponse?,
)

fun ChatMessageCursorPage.toResponse() = ChatMessagePageResponse(
    messages = messages.map { it.toResponse() },
    nextCursor = nextCursor,
    hasMore = hasMore,
    summary = summary?.let { ChatSummaryStateResponse(it.throughMessageId, it.noteId, it.noteTitle) },
)
