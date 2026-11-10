package io.uliss.note_service.dto.request

import io.uliss.note_service.util.PosterUrlNormalizer
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/** Transport bounds only; the link and crop rules are the owning service's. No [crop] means the centred defaults. */
data class SetNotePosterRequest(
    // twice the service limit leaves room for surrounding whitespace
    @field:NotBlank
    @field:Size(max = 2 * PosterUrlNormalizer.MAX_CHARS)
    val url: String?,
    val crop: PosterCropRequest? = null,
)
