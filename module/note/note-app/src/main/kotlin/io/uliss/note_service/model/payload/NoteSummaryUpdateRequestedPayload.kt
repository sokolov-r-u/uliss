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
)
