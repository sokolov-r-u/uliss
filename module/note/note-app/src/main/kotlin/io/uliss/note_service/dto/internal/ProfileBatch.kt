package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.model.projection.ProfileNote

/**
 * The next notes the user profile reads: the [profile] text they update (null when there is none yet), its
 * [profileVersion] to save against, the mark the profile moves [through], and whether notes [remain] after it.
 */
data class ProfileBatch(
    val profile: String?,
    val profileVersion: Long?,
    val notes: List<ProfileNote>,
    val through: NotesMark,
    val remain: Boolean,
)
