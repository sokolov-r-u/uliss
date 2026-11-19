package io.uliss.note_service.dto.internal

/** A chat's unsummarized tail against its limits, for the latest message page. */
data class ChatTailState(
    val chars: Long,
    val softChars: Int,
    val hardChars: Int,
    val summaryInputChars: Int,
    /** A Summarize of the chat (or a step of its chain) is still pending. */
    val summarizing: Boolean,
)
