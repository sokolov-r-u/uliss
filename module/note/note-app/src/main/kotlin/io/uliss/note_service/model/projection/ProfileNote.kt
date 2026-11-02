package io.uliss.note_service.model.projection

import java.time.Instant
import java.util.UUID

/** A note as the user profile reads it: its text and the position it moves the [NotesMark] to. */
data class ProfileNote(
    val id: UUID,
    val title: String?,
    val content: String,
    val updatedAt: Instant,
)
