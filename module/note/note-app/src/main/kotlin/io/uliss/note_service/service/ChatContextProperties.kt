package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties

/** How many messages through a summarized chat's boundary a turn still sends after the chat's notes. */
@ConfigurationProperties("note.assistant.context")
data class ChatContextProperties(
    val overlapMessages: Int = 6,
    val overlapMaxChars: Int = 8000,
) {
    init {
        require(overlapMessages >= 0) { "note.assistant.context.overlap-messages must not be negative" }
        require(overlapMaxChars >= 0) { "note.assistant.context.overlap-max-chars must not be negative" }
    }
}
