package io.uliss.note_service.dto.internal

import com.fasterxml.jackson.annotation.JsonClassDescription
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonPropertyDescription

/**
 * Structured model output for a chat summary the user already named: [NoteDraft] without the title. Same strict-mode
 * and `to*` rules as [NoteDraft].
 */
@JsonClassDescription("A standalone note capturing the user's thoughts from the current chat.")
data class NoteBodyDraft(
    @field:JsonPropertyDescription(
        "The main thought: one or more paragraphs, as many as the thought needs, with the user's own reasoning if " +
                "they gave any. It does not list other works: it names only its subject and at most one work it " +
                "cannot be understood without. The title is the user's and shown separately: its subject may be " +
                "named freely in the text, but do not use headings."
    )
    @field:JsonProperty(required = true)
    val mainThought: String?,
    @field:JsonPropertyDescription(SECONDARY_THOUGHTS_DESCRIPTION)
    @field:JsonProperty(required = true)
    val secondaryThoughts: List<String>?,
) {
    /** Main thought and secondary thoughts as one note; fails without a main thought. */
    fun toNoteContent(): String {
        val main = mainThought?.trim().orEmpty()
        check(main.isNotBlank()) { "summary model returned a blank main thought" }
        return formatNoteThoughts(main, secondaryThoughts)
    }
}
