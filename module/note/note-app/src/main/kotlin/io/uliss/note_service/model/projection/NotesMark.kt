package io.uliss.note_service.model.projection

import java.time.Instant
import java.util.UUID

/** How far the user profile has read the notes: every note at or before `(updatedAt, noteId)` is in it. */
data class NotesMark(val updatedAt: Instant, val noteId: UUID)
