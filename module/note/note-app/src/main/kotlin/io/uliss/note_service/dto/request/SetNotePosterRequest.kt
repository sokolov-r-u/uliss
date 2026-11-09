package io.uliss.note_service.dto.request

import io.uliss.note_service.util.PosterUrlNormalizer
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/** Transport bounds only; the link rules are the owning service's. */
data class SetNotePosterRequest(
    // twice the service limit leaves room for surrounding whitespace
    @field:NotBlank
    @field:Size(max = 2 * PosterUrlNormalizer.MAX_CHARS)
    val url: String?,
)
