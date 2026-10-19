package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.NoteNode
import java.util.UUID

/** A note found for the place picker, with its parent notes and the main constellation it lives in (if any). */
data class NoteSearchHit(
    val note: NoteNode,
    val ancestors: List<NoteNode>,
    val constellationId: UUID?,
)
