package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.projection.CurrentChatSummary
import java.util.UUID

data class ChatMessageCursorPage(
    val messages: List<ChatMessageEntity>,
    val nextCursor: UUID?,
    val hasMore: Boolean,
    /** The chat's current summary note; set on the latest page only. */
    val summary: CurrentChatSummary? = null,
)
