package io.uliss.note_service.dto.request

import io.uliss.note_service.model.ConstellationLightness
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size

/** Absent fields stay unchanged; [hue] is for a root, [lightness] for a sub-constellation. */
data class UpdateConstellationRequest(
    @field:Size(min = 1, max = 80)
    val name: String? = null,
    @field:Min(0)
    @field:Max(359)
    val hue: Int? = null,
    val lightness: ConstellationLightness? = null,
)
