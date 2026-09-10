package io.uliss.note_service.outbox

import java.util.UUID

data class NoteSummaryRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
    val chatId: UUID,
    val throughMessageId: UUID,
)
