package io.uliss.note_service.dto.internal

/**
 * What the model may know about the user before a reply or a summary: the [profile] compiled from their notes and
 * their own description [about]; at least one of them is there.
 */
data class UserBackground(
    val profile: String?,
    val about: String?,
)
