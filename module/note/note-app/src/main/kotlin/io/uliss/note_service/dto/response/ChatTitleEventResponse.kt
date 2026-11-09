package io.uliss.note_service.dto.response

/** SSE `title` payload: the chat's generated title, as JSON like `append`. */
data class ChatTitleEventResponse(
    val title: String,
)
