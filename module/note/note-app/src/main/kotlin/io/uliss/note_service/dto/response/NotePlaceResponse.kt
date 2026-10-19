package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.NotePlace

/** Where a note lives: parent notes from the top one down, and the top note's constellations, main first. */
data class NotePlaceResponse(
    val ancestors: List<NoteRefResponse>,
    val constellations: List<NoteConstellationResponse>,
)

fun NotePlace.toResponse() = NotePlaceResponse(
    ancestors = ancestors.map { it.toRefResponse() },
    constellations = memberships.map { it.toResponse() },
)
