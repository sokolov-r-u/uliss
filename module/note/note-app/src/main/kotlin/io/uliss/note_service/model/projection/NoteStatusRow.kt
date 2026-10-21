package io.uliss.note_service.model.projection

import io.uliss.note_service.model.NoteStatus
import java.time.Instant
import java.util.UUID

/** What a status poll needs of a note, without its content; a JPQL constructor projection. */
data class NoteStatusRow(
    val id: UUID,
    val status: NoteStatus,
    val updatedAt: Instant?,
)
