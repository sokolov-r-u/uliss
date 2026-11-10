package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.NoteMembership
import io.uliss.note_service.model.projection.NotePoster
import java.time.Instant
import java.util.UUID

/**
 * A star of the sky. [parentNoteId] is the nearest ancestor that is itself a star; a star without one carries the
 * memberships of its top note (main first), every other star has none and lives where its parent lives. [poster] is
 * the note's own poster, null without one.
 */
data class SkyNote(
    val id: UUID,
    val title: String,
    val parentNoteId: UUID?,
    val createdAt: Instant,
    val memberships: List<NoteMembership>,
    val icon: String? = null,
    val poster: NotePoster? = null,
)
