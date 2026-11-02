package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.UserProfileView
import java.time.Instant

/** The caller's profile; both fields are null until the first nightly refresh writes it. */
data class UserProfileResponse(
    val content: String?,
    val updatedAt: Instant?,
)

fun UserProfileView?.toResponse(): UserProfileResponse = UserProfileResponse(this?.content, this?.updatedAt)
