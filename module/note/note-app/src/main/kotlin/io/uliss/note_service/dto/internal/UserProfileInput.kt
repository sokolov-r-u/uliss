package io.uliss.note_service.dto.internal

/**
 * What the user told the profile themselves: their own description and the rules for writing the profile, at
 * [rulesVersion] (0 before the first rules).
 */
data class UserProfileInput(
    val about: String?,
    val rules: List<String>,
    val rulesVersion: Int = 0,
)
