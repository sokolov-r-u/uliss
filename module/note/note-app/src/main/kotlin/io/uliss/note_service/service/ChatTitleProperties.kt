package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties

/** OpenAI per-call options and the input limit for generating a chat title from the first message. */
@ConfigurationProperties("note.chat-title")
data class ChatTitleProperties(
    val reasoningEffort: String = "low",
    val verbosity: String = "low",
    val maxInputChars: Int = 2000,
)
