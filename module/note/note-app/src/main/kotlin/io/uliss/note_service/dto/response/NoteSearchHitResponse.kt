package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.NoteSearchHit
import java.util.UUID

/** A note found for the place picker: its parent notes and the main constellation it lives in, if any. */
data class NoteSearchHitResponse(
    val id: UUID,
    val title: String?,
    val ancestors: List<NoteRefResponse>,
    val constellationId: UUID?,
    val icon: String? = null,
)

fun NoteSearchHit.toResponse() = NoteSearchHitResponse(
    id = note.id,
    title = note.title,
    ancestors = ancestors.map { it.toRefResponse() },
    constellationId = constellationId,
    icon = note.icon,
)
