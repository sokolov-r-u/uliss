package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.util.UUID

/**
 * Transport bound only; the 40-code-point name rule is enforced by the owning service.
 * 80 UTF-16 chars is the smallest bound that never rejects 40 code points.
 */
data class CreateConstellationRequest(
    @field:NotBlank
    @field:Size(max = 80)
    val name: String,
    /** Null creates a root. */
    val parentId: UUID? = null,
)
