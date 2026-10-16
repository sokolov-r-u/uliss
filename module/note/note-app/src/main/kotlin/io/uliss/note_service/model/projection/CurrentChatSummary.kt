package io.uliss.note_service.model.projection

import java.util.UUID

/** The chat's current summary note and the last message it covers (null for legacy notes). */
data class CurrentChatSummary(
    val noteId: UUID,
    val noteTitle: String?,
    val throughMessageId: UUID?,
)
