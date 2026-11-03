package io.uliss.note_service.dto.internal

import java.time.Instant

/**
 * Where the user stands with profile rebuilds: whether one is [running], how many tries [remaining] in the window, and
 * when the next one is available once none are left (null while some are).
 */
data class ProfileRebuildState(
    val running: Boolean,
    val remaining: Int,
    val availableAt: Instant?,
)
