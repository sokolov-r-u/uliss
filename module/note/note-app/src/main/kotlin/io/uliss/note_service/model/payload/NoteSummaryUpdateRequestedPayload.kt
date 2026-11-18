package io.uliss.note_service.model.payload

import java.util.UUID

/** Appends the messages in (afterMessageId, throughMessageId] to an existing summary note. */
data class NoteSummaryUpdateRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
    val chatId: UUID,
    val idempotencyKey: UUID,
    val afterMessageId: UUID?,
    val throughMessageId: UUID,
    /** The chat's latest message when the Summarize was asked for; a chain continues to it. Null: one step only. */
    val targetMessageId: UUID? = null,
)
