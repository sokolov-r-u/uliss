package io.uliss.note_service.dto.request

import io.uliss.note_service.model.SummaryMode
import java.util.UUID

data class SummarizeRequest(
    val mode: SummaryMode = SummaryMode.CREATE,
    val targetNoteId: UUID? = null,
)
