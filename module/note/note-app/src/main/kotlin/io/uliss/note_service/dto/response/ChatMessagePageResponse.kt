package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ChatMessageCursorPage
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
