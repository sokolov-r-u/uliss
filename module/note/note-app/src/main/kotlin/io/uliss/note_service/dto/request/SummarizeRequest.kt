package io.uliss.note_service.dto.request

import io.uliss.note_service.model.SummaryMode
import java.util.UUID

data class SummarizeRequest(
    val mode: SummaryMode = SummaryMode.CREATE,
    val targetNoteId: UUID? = null,
    /** The main constellation of the new note (CREATE only); null leaves it without a place. */
    val constellationId: UUID? = null,
    /** The parent note of the new note (CREATE only, not with [constellationId]); it lives where the parent lives. */
    val parentNoteId: UUID? = null,
    /** The user's name for the new note (CREATE only); blank lets the model name it. */
    val title: String? = null,
    /** The user's emoji for the new note (CREATE only); blank means none. */
    val icon: String? = null,
)
