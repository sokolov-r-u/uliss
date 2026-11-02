package io.uliss.note_service.model.payload

import java.util.UUID

/** Rewrites a READY summary note's content from its whole chat through throughMessageId. */
data class NoteResummarizeRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
    val chatId: UUID,
    val idempotencyKey: UUID,
    val throughMessageId: UUID,
)
