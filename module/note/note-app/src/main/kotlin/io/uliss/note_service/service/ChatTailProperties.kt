package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties

/**
 * Limits of a chat's unsummarized tail, in characters: past [softChars] the UI suggests Summarize, past [hardChars] a
 * new message is refused, and one summary call reads at most [summaryInputChars] of chat messages.
 */
@ConfigurationProperties("note.assistant.tail")
data class ChatTailProperties(
    val softChars: Int = 40_000,
    val hardChars: Int = 60_000,
    val summaryInputChars: Int = 80_000,
) {
    init {
        require(softChars in 1..<hardChars && hardChars <= summaryInputChars) {
            "note.assistant.tail needs 0 < soft-chars < hard-chars <= summary-input-chars"
        }
    }
}
