package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.SkyNote
import io.uliss.note_service.dto.internal.SkyView
import java.time.Instant
import java.util.UUID

/** The whole sky: the constellation tree as a flat list and the stars, oldest first. */
data class SkyResponse(
    val constellations: List<ConstellationResponse>,
    val notes: List<SkyNoteResponse>,
)

/** A star without its text; [memberships] are set only on a star with no parent star, main first. */
data class SkyNoteResponse(
    val id: UUID,
    val title: String,
    val parentNoteId: UUID?,
    val createdAt: Instant,
    val memberships: List<NoteConstellationResponse>,
    val icon: String? = null,
)

fun SkyView.toResponse() = SkyResponse(constellations.map { it.toResponse() }, notes.map { it.toResponse() })

fun SkyNote.toResponse() =
    SkyNoteResponse(id, title, parentNoteId, createdAt, memberships.map { it.toResponse() }, icon)
