package io.uliss.note_service.dto.internal

import java.util.UUID

/**
 * What a chat turn sends the model instead of the history through [boundaryMessageId]: the chat's summary notes,
 * the main note first.
 */
data class ChatContext(
    val boundaryMessageId: UUID,
    val notes: List<ChatContextNote>,
)
