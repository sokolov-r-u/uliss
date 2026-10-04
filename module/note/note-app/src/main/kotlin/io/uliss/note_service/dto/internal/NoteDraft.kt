package io.uliss.note_service.dto.internal

import com.fasterxml.jackson.annotation.JsonClassDescription
import com.fasterxml.jackson.annotation.JsonPropertyDescription

/** Structured model output for a chat summary; fields are nullable so validation stays in our code. */
@JsonClassDescription("A standalone note summarizing the current chat.")
data class NoteDraft(
    @field:JsonPropertyDescription(
        "Note title: a short noun phrase naming the topic, at most 50 characters, in the language of the " +
                "current chat. Plain text without Markdown, quotes, or a trailing period."
    )
    val title: String?,
    @field:JsonPropertyDescription(
        "Note body in GitHub Flavored Markdown. The title is displayed separately: do not repeat it here " +
                "and do not start with a title or heading."
    )
    val content: String?,
)
