package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.NotesMark
import io.uliss.note_service.model.projection.ProfileNote
import java.util.UUID

/**
 * The next notes the user profile reads: the [profile] text they update (null when there is none yet), its
 * [profileVersion] to save against, the mark the profile moves [through], and whether notes [remain] after it. A batch
 * of a running full rebuild carries its [rebuildId]: [profile] and [profileVersion] are then the rebuild's draft.
 */
data class ProfileBatch(
    val profile: String?,
    val profileVersion: Long?,
    val notes: List<ProfileNote>,
    val through: NotesMark,
    val remain: Boolean,
    val rebuildId: UUID? = null,
    val input: UserProfileInput = UserProfileInput(null, emptyList()),
)
