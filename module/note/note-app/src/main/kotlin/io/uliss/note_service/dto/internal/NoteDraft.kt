package io.uliss.note_service.dto.internal

/** Structured model output for a chat summary; fields are nullable so validation stays in our code. */
data class NoteDraft(
    val title: String?,
    val content: String?,
)
