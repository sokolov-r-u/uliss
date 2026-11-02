package io.uliss.note_service.dto.internal

import java.time.Instant

/** The user profile as the chat and the profile page read it: its text and when it was last written. */
data class UserProfileView(
    val content: String,
    val updatedAt: Instant,
)
