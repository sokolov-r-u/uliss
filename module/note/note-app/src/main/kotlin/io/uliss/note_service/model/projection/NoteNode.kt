package io.uliss.note_service.model.projection

import java.time.Instant
import java.util.UUID

/** One note as the note hierarchy sees it: its parent link, title and age. */
data class NoteNode(
    val id: UUID,
    val parentNoteId: UUID?,
    val title: String?,
    val createdAt: Instant,
)
