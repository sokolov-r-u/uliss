package io.uliss.note_service.util

object TitleNormalizer {
    private const val MAX_CODE_POINTS = 50
    private const val SUFFIX = "..."

    private val WHITESPACE = Regex("\\s+")
    private val HEADING_MARKER = Regex("^#+\\s*")
    private val QUOTE_PAIRS = mapOf('"' to '"', '\'' to '\'', '“' to '”', '«' to '»', '`' to '`')

    /** First non-blank line of the user's message; the text is never altered beyond whitespace. */
    fun normalizeChatTitle(message: String): String =
        truncate(firstLine(message))

    /** Cleans the model's title, else derives one from the content; null if neither yields text. */
    fun normalizeNoteTitle(title: String?, content: String): String? =
        cleanModelTitle(title) ?: cleanModelTitle(content)

    private fun cleanModelTitle(raw: String?): String? {
        if (raw == null) return null
        return truncate(stripDecoration(firstLine(raw))).takeIf { it.isNotEmpty() }
    }

    /** First non-blank line with surrounding whitespace trimmed and inner whitespace runs collapsed. */
    private fun firstLine(text: String): String =
        text.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() }
            ?.replace(WHITESPACE, " ")
            .orEmpty()

    /** Truncates by code points; the suffix counts toward the limit. */
    private fun truncate(text: String): String {
        if (text.codePointCount(0, text.length) <= MAX_CODE_POINTS) return text
        val keep = MAX_CODE_POINTS - SUFFIX.length
        return text.substring(0, text.offsetByCodePoints(0, keep)).trimEnd() + SUFFIX
    }

    /** Removes a leading Markdown heading marker and one pair of surrounding quotes. */
    private fun stripDecoration(text: String): String = stripQuotes(text.replace(HEADING_MARKER, "")).trim()

    private fun stripQuotes(text: String): String {
        val closing = text.firstOrNull()?.let(QUOTE_PAIRS::get) ?: return text
        return if (text.length >= 2 && text.last() == closing) text.substring(1, text.length - 1) else text
    }
}
