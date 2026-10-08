package io.uliss.note_service.dto.internal

import com.fasterxml.jackson.annotation.JsonClassDescription
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonPropertyDescription

/**
 * Structured model output for a chat summary; fields are nullable so validation stays in our code, but marked
 * required because OpenAI strict structured outputs need every property in the schema's `required` list.
 * Behavior is exposed as `to*` functions, never as properties or `get*` methods, which would leak into the schema.
 */
@JsonClassDescription("A standalone note capturing the user's thoughts from the current chat.")
data class NoteDraft(
    @field:JsonPropertyDescription(
        "Note title: a short noun phrase that names the main thought, at most 50 characters, in the language of " +
                "the current chat. Plain text without Markdown, quotes, or a trailing period."
    )
    @field:JsonProperty(required = true)
    val title: String?,
    @field:JsonPropertyDescription(
        "The main thought: one or more paragraphs, as many as the thought needs, " +
                "with the user's own reasoning if they gave any. The title is displayed separately: do not repeat " +
                "it here and do not use headings."
    )
    @field:JsonProperty(required = true)
    val mainThought: String?,
    @field:JsonPropertyDescription(
        "Secondary thoughts, each one or two sentences that build on the main thought: extend it, qualify it, " +
                "contrast with it, or lead to a next step. Each is shown as a list item, so use only inline " +
                "formatting. At most three; fewer is better, and an empty list is fine — include only what is " +
                "worth remembering. Put open questions and intentions last."
    )
    @field:JsonProperty(required = true)
    val secondaryThoughts: List<String>?,
) {
    /** Main thought paragraphs followed by up to [MAX_SECONDARY_THOUGHTS] one-line bullets; fails without a main thought. */
    fun toNoteContent(): String {
        val main = mainThought?.trim().orEmpty()
        check(main.isNotBlank()) { "summary model returned a blank main thought" }
        val bullets = secondaryThoughts.orEmpty()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .take(MAX_SECONDARY_THOUGHTS)
        if (bullets.isEmpty()) return main
        return main + "\n\n" + bullets.joinToString("\n") { "- $it" }
    }

    private companion object {
        const val MAX_SECONDARY_THOUGHTS = 3
    }
}
