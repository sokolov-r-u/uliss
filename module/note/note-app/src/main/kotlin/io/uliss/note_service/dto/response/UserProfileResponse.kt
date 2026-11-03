package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ProfileRebuildState
import io.uliss.note_service.dto.internal.UserProfileView
import java.time.Instant

/** The caller's profile, both fields null until the first refresh writes it, and their rebuild state. */
data class UserProfileResponse(
    val content: String?,
    val updatedAt: Instant?,
    val rebuild: ProfileRebuildResponse,
)

fun UserProfileView?.toResponse(rebuild: ProfileRebuildState): UserProfileResponse =
    UserProfileResponse(this?.content, this?.updatedAt, rebuild.toResponse())
