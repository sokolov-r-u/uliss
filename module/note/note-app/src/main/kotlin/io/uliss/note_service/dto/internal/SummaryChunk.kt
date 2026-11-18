package io.uliss.note_service.dto.internal

import java.util.UUID

/** One step of a Summarize: its last message, and the message a chain continues to (null when this step is all). */
data class SummaryChunk(
    val throughMessageId: UUID,
    val targetMessageId: UUID?,
)
