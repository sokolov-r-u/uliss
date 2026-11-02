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
        "The main new thought: what is new about the existing note's subject, otherwise the most important new " +
                "thought on another topic; one or more paragraphs, with the user's own reasoning if they gave any. " +
                "It does not list other works: it names only its subject and at most one work it cannot be " +
                "understood without. " +
                "Do not restate the existing note and do not use headings."
    )
    @field:JsonProperty(required = true)
    val mainThought: String?,
    @field:JsonPropertyDescription(
        "Other new thoughts worth remembering on their own, each one or two sentences: a distinct opinion, " +
                "conclusion, preference, decision, or intention of the user. Works, artists, people, or places the " +
                "user named with their evaluation go here, grouped by what the user thinks of them; one item may " +
                "list several, and none repeats a work the main thought names. Not passing remarks, not a question " +
                "the user asked for information and got answered, and an item never repeats the main thought or " +
                "another item. No fixed limit — as many as the new " +
                "messages really hold, usually a few; an empty list is fine. Each is shown as a list item, so use " +
                "only inline formatting."
    )
    @field:JsonProperty(required = true)
    val secondaryThoughts: List<String>?,
) {
    /**
     * The addendum body, or null when the model reported nothing new. A missing main thought is a malformed answer,
     * not "nothing new": it fails so the outbox retries instead of moving the boundary past unsummarized messages.
     */
    fun toAddendumContent(): String? {
        if (nothingNew == true) return null
        val main = mainThought?.trim().orEmpty()
        check(main.isNotBlank()) { "summary update model returned a blank main thought" }
        return formatNoteThoughts(main, secondaryThoughts)
    }
}
