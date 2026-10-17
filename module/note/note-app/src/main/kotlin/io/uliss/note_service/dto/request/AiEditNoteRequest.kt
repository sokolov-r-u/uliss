package io.uliss.note_service.dto.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/** A command for the model and the note text as the editor holds it, unsaved edits included. */
data class AiEditNoteRequest(
    @field:NotBlank
    @field:Size(max = 1_000)
    val instruction: String,
    @field:NotBlank
    @field:Size(max = 30_000)
    val content: String,
)
