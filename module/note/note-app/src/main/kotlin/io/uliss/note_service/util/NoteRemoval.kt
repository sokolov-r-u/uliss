package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.SubNoteAdoption
import io.uliss.note_service.model.projection.NoteMembership
import java.util.UUID

/** What happens to the sub-notes of a deleted note when the user keeps them. */
object NoteRemoval {

    /**
     * The direct sub-notes of [noteId] take its place: under its parent when it has one, otherwise as top notes with
     * a copy of its [memberships] (main and joining times included, so later promotions keep the same order). Deeper
     * sub-notes stay under their parents and follow.
     */
    fun keepSubNotes(hierarchy: NoteHierarchy, noteId: UUID, memberships: List<NoteMembership>): SubNoteAdoption {
        val note = checkNotNull(hierarchy.find(noteId)) { "note id=$noteId is not in the hierarchy" }
        val childIds = hierarchy.childrenOf(noteId).map { it.id }
        val copies = if (note.parentNoteId == null) childIds.associateWith { memberships } else emptyMap()
        return SubNoteAdoption(childIds, note.parentNoteId, copies.filterValues { it.isNotEmpty() })
    }
}
