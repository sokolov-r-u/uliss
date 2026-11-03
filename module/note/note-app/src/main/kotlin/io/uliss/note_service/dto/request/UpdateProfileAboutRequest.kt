package io.uliss.note_service.dto.request

import jakarta.validation.constraints.Size

/** The user's description of themselves; blank clears it. */
data class UpdateProfileAboutRequest(
    @field:Size(max = 2_000)
    val about: String? = null,
)
