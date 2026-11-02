package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ProfileRebuildState
import java.time.Instant

/** The caller's rebuild state: running now, tries left in the window, and when the next one is available. */
data class ProfileRebuildResponse(
    val running: Boolean,
    val remaining: Int,
    val availableAt: Instant?,
)

fun ProfileRebuildState.toResponse(): ProfileRebuildResponse = ProfileRebuildResponse(running, remaining, availableAt)
