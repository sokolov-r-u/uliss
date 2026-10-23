package io.uliss.note_service.model.projection

import io.uliss.note_service.model.NoteStatus
import java.time.Instant
import java.util.UUID

/** One note of the user as the sky snapshot reads it: its parent link, title, icon, status and age. */
data class SkyNoteRow(
    val id: UUID,
    val parentNoteId: UUID?,
    val title: String?,
    val status: NoteStatus,
    val createdAt: Instant,
    val icon: String? = null,
)
