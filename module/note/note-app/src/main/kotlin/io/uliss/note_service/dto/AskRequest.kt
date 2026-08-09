package io.uliss.note_service.dto

import jakarta.validation.constraints.NotBlank

data class AskRequest(
    @field:NotBlank
    val prompt: String,
)
