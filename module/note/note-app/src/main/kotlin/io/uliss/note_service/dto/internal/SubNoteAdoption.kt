package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.NoteMembership
import java.util.UUID

/**
 * Where the kept sub-notes of a deleted note go: [childIds] hang under [parentNoteId] (null: they become top notes)
 * and take the [memberships] given per note.
 */
data class SubNoteAdoption(
    val childIds: List<UUID>,
    val parentNoteId: UUID?,
    val memberships: Map<UUID, List<NoteMembership>>,
)
