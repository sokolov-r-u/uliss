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
    @field:JsonPropertyDescription(MAIN_THOUGHT_DESCRIPTION)
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

internal const val MAIN_THOUGHT_DESCRIPTION = "The main thought: one or more paragraphs, as many as the thought " +
        "needs, with the user's own reasoning if they gave any. The title is displayed separately: do not repeat " +
        "it here and do not use headings."

internal const val SECONDARY_THOUGHTS_DESCRIPTION = "Other thoughts worth remembering on their own, each one or " +
        "two sentences: a distinct opinion, conclusion, preference, decision, or intention of the user. Not passing " +
        "remarks or details that only support the main thought. No fixed limit — as many as the chat really holds, " +
        "usually a few; an empty list is fine. Each is shown as a list item, so use only inline formatting. Put " +
        "open questions and intentions last."

// Models may still emit Markdown list syntax; we render each thought as exactly one bullet.
private val LINE_BREAKS = Regex("\\s*\\R\\s*")
private val LIST_MARKER = Regex("^(?:[-*+]|\\d+[.)])(?:\\s+|$)")

/** Main thought paragraphs followed by every secondary thought as a one-line bullet. */
internal fun formatNoteThoughts(mainThought: String, secondaryThoughts: List<String>?): String {
    val bullets = secondaryThoughts.orEmpty()
        .map { it.replace(LINE_BREAKS, " ").trim().replace(LIST_MARKER, "") }
        .filter { it.isNotEmpty() }
    if (bullets.isEmpty()) return mainThought
    return mainThought + "\n\n" + bullets.joinToString("\n") { "- $it" }
}
