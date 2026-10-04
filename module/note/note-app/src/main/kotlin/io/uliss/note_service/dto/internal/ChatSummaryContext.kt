package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatMessageEntity

data class ChatSummaryContext(
    val title: String,
    val messages: List<ChatMessageEntity>,
)
