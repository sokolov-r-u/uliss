package io.uliss.note_service.dto.response

import io.uliss.note_service.model.projection.NoteMembership
import java.util.UUID

/** One constellation of a note; lists come main first, then by the time the note joined. */
data class NoteConstellationResponse(
    val constellationId: UUID,
    val main: Boolean,
)

fun NoteMembership.toResponse() = NoteConstellationResponse(constellationId, main)
