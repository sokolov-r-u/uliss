package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatMessageEntity
import java.util.UUID

data class ChatMessageCursorPage(
    val messages: List<ChatMessageEntity>,
    val nextCursor: UUID?,
    val hasMore: Boolean,
)
