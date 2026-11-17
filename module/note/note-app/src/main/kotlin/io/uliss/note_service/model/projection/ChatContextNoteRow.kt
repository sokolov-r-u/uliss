package io.uliss.note_service.model.projection

import java.util.UUID

/** One summary note of a chat with its link's boundary, read in one query so the text and boundary agree. */
data class ChatContextNoteRow(
    val noteId: UUID,
    val title: String?,
    val content: String?,
    val main: Boolean,
    val summarizedThroughMessageId: UUID?,
)
