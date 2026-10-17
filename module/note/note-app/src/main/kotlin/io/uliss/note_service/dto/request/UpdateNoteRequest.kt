package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

/** Transport bounds only; the title and content rules are enforced by the owning service. */
data class UpdateNoteRequest(
    @field:NotBlank
    @field:Size(max = 100)
    val title: String,
    @field:NotBlank
    val content: String,
    /** The note version the edit started from; a newer stored version rejects the edit. */
    @field:NotNull
    val version: Long?,
)
