package io.uliss.note_service.model.projection

import java.util.UUID

/** Distinct notes in a constellation's subtree ([noteCount]) and in the constellation itself ([ownNoteCount]). */
data class ConstellationNoteCount(
    val constellationId: UUID,
    val noteCount: Int,
    val ownNoteCount: Int,
)
