package io.uliss.note_service.model.payload

import java.util.UUID

data class NoteSummaryRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
    val chatId: UUID,
    val throughMessageId: UUID,
)
