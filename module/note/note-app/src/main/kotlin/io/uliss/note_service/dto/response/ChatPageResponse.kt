package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ChatWithNoteCount
import io.uliss.note_service.dto.internal.KeysetPage

data class ChatPageResponse(
    val items: List<ChatResponse>,
    val nextCursor: String?,
)

fun KeysetPage<ChatWithNoteCount>.toResponse() = ChatPageResponse(items.map { it.toResponse() }, nextCursor?.encode())
