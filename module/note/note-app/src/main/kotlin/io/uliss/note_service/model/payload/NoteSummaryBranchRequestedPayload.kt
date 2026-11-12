package io.uliss.note_service.model.payload

import java.util.UUID

/**
 * Writes the messages in (afterMessageId, throughMessageId] into the new note [noteId], branched from the chat's main
 * note [mainNoteId], whose text the model gets as already recorded.
 */
data class NoteSummaryBranchRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
    val chatId: UUID,
    val mainNoteId: UUID,
    val afterMessageId: UUID?,
    val throughMessageId: UUID,
)
