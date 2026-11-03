package io.uliss.note_service.dto.internal

/** A profile [profile] text behind the user's rules, its [profileVersion] to save against, and the [input] to apply. */
data class ProfileRulesWork(
    val profile: String,
    val profileVersion: Long,
    val input: UserProfileInput,
)
