package io.uliss.note_service.dto.request

import io.uliss.note_service.model.SummaryMode
import java.util.UUID

data class SummarizeRequest(
    val mode: SummaryMode = SummaryMode.CREATE,
    val targetNoteId: UUID? = null,
    /** The main constellation of the new note (CREATE only); null leaves it without a place. */
    val constellationId: UUID? = null,
)
