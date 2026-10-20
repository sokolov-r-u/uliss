package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties

/** OpenAI per-call options for chat replies; values are passed to the provider as-is. */
@ConfigurationProperties("note.assistant")
data class AssistantProperties(
    val reasoningEffort: String = "low",
    val verbosity: String = "low",
)
