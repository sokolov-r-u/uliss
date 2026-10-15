package io.uliss.note_service.dto.internal

import com.fasterxml.jackson.annotation.JsonClassDescription
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonPropertyDescription

/**
 * Structured model output for a summary update; mirrors [NoteDraft] without a title. Every property is required for
 * OpenAI strict structured outputs; behavior stays in `to*` functions so it never leaks into the schema.
 */
@JsonClassDescription("New thoughts to append to an existing note, or a report that the new messages add none.")
data class NoteAddendumDraft(
    @field:JsonPropertyDescription(
        "True when the new messages add no thought of the user's beyond the existing note; the other fields are " +
                "then ignored and may be empty."
    )
    @field:JsonProperty(required = true)
    val nothingNew: Boolean?,
    @field:JsonPropertyDescription(
        "The most important new thought: one or more paragraphs, with the user's own reasoning if they gave any. " +
                "Do not restate the existing note and do not use headings."
    )
    @field:JsonProperty(required = true)
    val mainThought: String?,
    @field:JsonPropertyDescription(
        "Other new thoughts, each one or two sentences. Each is shown as a list item, so use only inline " +
                "formatting. At most three; fewer is better, and an empty list is fine."
    )
    @field:JsonProperty(required = true)
    val secondaryThoughts: List<String>?,
) {
    /** The addendum body, or null when the model reported nothing new or gave no main thought. */
    fun toAddendumContent(): String? {
        if (nothingNew == true) return null
        val main = mainThought?.trim().orEmpty()
        if (main.isBlank()) return null
        return formatNoteThoughts(main, secondaryThoughts)
    }
}
