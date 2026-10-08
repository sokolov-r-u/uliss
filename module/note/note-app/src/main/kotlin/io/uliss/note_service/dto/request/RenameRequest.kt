package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * Transport bound only; the 50-code-point title rule is enforced by the owning service.
 * 100 UTF-16 chars is the smallest bound that never rejects 50 code points (at most 2 chars each).
 */
data class RenameRequest(
    @field:NotBlank
    @field:Size(max = 100)
    val title: String,
)
