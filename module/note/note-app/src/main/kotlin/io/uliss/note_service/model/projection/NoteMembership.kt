package io.uliss.note_service.model.projection

import java.time.Instant
import java.util.UUID

/** One constellation a note belongs to; a row of `note_constellation` read through `JdbcTemplate`. */
data class NoteMembership(
    val constellationId: UUID,
    val main: Boolean,
    val addedAt: Instant,
)
