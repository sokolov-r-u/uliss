package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatMessageEntity

/**
 * The chat messages a turn sends after its notes, in chronological order: the first [overlap] of [messages] are
 * already covered by the notes; [skipped] earlier messages are left out.
 */
data class ChatHistorySelection(
    val messages: List<ChatMessageEntity>,
    val overlap: Int,
    val skipped: Int,
)
