package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.NoteNode

/** Where a note lives: its parent notes from the top one down, and the constellations of the top note. */
data class NotePlace(
    val ancestors: List<NoteNode>,
    val memberships: List<NoteMembership>,
)
