package io.uliss.note_service.dto

import io.uliss.note_service.service.type.ChatMessageCursorPage
import java.util.UUID

data class ChatMessagePageResponse(
    val messages: List<ChatMessageResponse>,
    val nextCursor: UUID?,
    val hasMore: Boolean,
)

fun ChatMessageCursorPage.toResponse() = ChatMessagePageResponse(
    messages = messages.map { it.toResponse() },
    nextCursor = nextCursor,
    hasMore = hasMore,
)
