package io.uliss.note_service.model.payload

import java.util.UUID

data class NoteSummaryRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
    val chatId: UUID,
    val throughMessageId: UUID,
    /** The chat's latest message when the Summarize was asked for; a chain continues to it. Null: one step only. */
    val targetMessageId: UUID? = null,
)
