package io.uliss.note_service.util

object ConstellationNameNormalizer {
    private const val MAX_CODE_POINTS = 40
    private val WHITESPACE = Regex("\\s+")

    const val RULE = "name must be 1 to 40 characters"

    /** Trimmed name with whitespace runs collapsed; null when blank or over the limit. */
    fun normalize(raw: String): String? {
        val name = raw.trim().replace(WHITESPACE, " ")
        if (name.isEmpty() || name.codePointCount(0, name.length) > MAX_CODE_POINTS) return null
        return name
    }
}
