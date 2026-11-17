package io.uliss.note_service.dto.internal

/**
 * A turn of a summarized chat sends [notes] instead of the history before its boundary; its history starts with
 * [overlap] messages through the boundary, and [skipped] earlier messages are left out.
 */
data class ChatHistoryCut(
    val notes: List<ChatContextNote>,
    val overlap: Int,
    val skipped: Int,
)
