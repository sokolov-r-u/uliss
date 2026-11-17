package io.uliss.note_service.dto.internal

import java.util.UUID

/** A summary note of a chat as the chat's model sees it: its current text and whether it is the main note. */
data class ChatContextNote(
    val noteId: UUID,
    val title: String?,
    val content: String,
    val main: Boolean,
)
