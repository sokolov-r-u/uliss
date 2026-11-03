package io.uliss.note_service.dto.internal

/** What the user told the profile themselves: their own description and the rules for writing the profile. */
data class UserProfileInput(
    val about: String?,
    val rules: List<String>,
)
