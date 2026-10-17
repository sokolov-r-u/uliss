package io.uliss.note_service.util

object NoteContentNormalizer {

    const val MAX_CHARS = 100_000
    const val USER_CONTENT_RULE = "content must be 1 to $MAX_CHARS characters"

    /** User-edited Markdown without trailing whitespace; null when blank or over the limit. */
    fun normalizeUserContent(raw: String): String? {
        val content = raw.trimEnd()
        if (content.isBlank() || content.length > MAX_CHARS) return null
        return content
    }
}
