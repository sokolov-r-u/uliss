package io.uliss.note_service.dto

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

data class SendMessageRequest(
    @field:NotBlank
    @field:Size(max = 8000)
    val content: String,
)
