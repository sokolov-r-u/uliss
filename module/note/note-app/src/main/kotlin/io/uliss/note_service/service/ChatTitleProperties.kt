package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/** OpenAI per-call options and the input limit for generating a chat title from the first message. */
@ConfigurationProperties("note.chat-title")
data class ChatTitleProperties(
    val reasoningEffort: String = "low",
    val verbosity: String = "low",
    val maxInputChars: Int = 2000,
    /** How long the first turn's stream waits for the title; a later title is dropped. */
    val timeout: Duration = Duration.ofSeconds(10),
)
