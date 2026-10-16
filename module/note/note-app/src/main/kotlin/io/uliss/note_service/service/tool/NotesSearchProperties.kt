package io.uliss.note_service.service.tool

import org.springframework.boot.context.properties.ConfigurationProperties

/** Limits of the chat assistant's notes search tool. */
@ConfigurationProperties("note.assistant.notes-search")
data class NotesSearchProperties(
    val topK: Int = 5,
    val minSimilarity: Double = 0.70,
    val maxCallsPerTurn: Int = 3,
)
