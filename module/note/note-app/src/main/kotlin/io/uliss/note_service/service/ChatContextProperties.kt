package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties

/** How many messages through a summarized chat's boundary a turn still sends after the chat's notes. */
@ConfigurationProperties("note.assistant.context")
data class ChatContextProperties(
    val overlapMessages: Int = 6,
    val overlapMaxChars: Int = 8000,
)
