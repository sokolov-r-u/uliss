package io.uliss.note_service.dto

import jakarta.validation.constraints.Size

data class CreateChatRequest(
    @field:Size(max = 255)
    val title: String? = null,
)
