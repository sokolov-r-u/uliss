package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ChatMessageCursorPage
import java.util.UUID

data class ChatSummaryStateResponse(
    val throughMessageId: UUID?,
    val noteId: UUID,
    val noteTitle: String?,
    val noteIcon: String? = null,
)

data class ChatTailStateResponse(
    val chars: Long,
    val softChars: Int,
    val hardChars: Int,
    val summaryInputChars: Int,
    val summarizing: Boolean,
)

data class ChatMessagePageResponse(
    val messages: List<ChatMessageResponse>,
    val nextCursor: UUID?,
    val hasMore: Boolean,
    val summary: ChatSummaryStateResponse?,
    val tail: ChatTailStateResponse? = null,
)

fun ChatMessageCursorPage.toResponse() = ChatMessagePageResponse(
    messages = messages.map { it.toResponse() },
    nextCursor = nextCursor,
    hasMore = hasMore,
    summary = summary?.let { ChatSummaryStateResponse(it.throughMessageId, it.noteId, it.noteTitle, it.noteIcon) },
    tail = tail?.let {
        ChatTailStateResponse(it.chars, it.softChars, it.hardChars, it.summaryInputChars, it.summarizing)
    },
)
