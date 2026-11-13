package io.uliss.note_service.dto.request

import io.uliss.note_service.model.SummaryMode
import java.util.UUID

data class SummarizeRequest(
    val mode: SummaryMode = SummaryMode.CREATE,
    /** The chat's main note as the client knows it (UPDATE and BRANCH); a stale one is a conflict. */
    val targetNoteId: UUID? = null,
    /** The main constellation of the new note (not with UPDATE); null leaves it without a place. */
    val constellationId: UUID? = null,
    /** The parent note of the new note (not with UPDATE, not with [constellationId]); it lives where the parent lives. */
    val parentNoteId: UUID? = null,
    /** The user's name for the new note (not with UPDATE); blank lets the model name it. */
    val title: String? = null,
    /** The user's emoji for the new note (not with UPDATE); blank means none. */
    val icon: String? = null,
)
