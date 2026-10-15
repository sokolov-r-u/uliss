package io.uliss.note_service.dto.response

/** SSE `append` payload. JSON keeps leading spaces and line breaks that raw `data:` lines would lose. */
data class AssistantTextChunkResponse(
    val text: String,
)
