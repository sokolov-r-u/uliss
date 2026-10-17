package io.uliss.note_service.service

import org.springframework.boot.context.properties.ConfigurationProperties

/** OpenAI per-call options for model rewrites of a note; values are passed to the provider as-is. */
@ConfigurationProperties("note.ai-edit")
data class NoteAiEditProperties(
    val reasoningEffort: String = "low",
    val verbosity: String = "medium",
)
