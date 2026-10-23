package io.uliss.note_service.util

import java.text.BreakIterator
import java.util.Locale

/** A note icon: exactly one emoji, which may be a compound one (ZWJ sequences, skin tones, flags, keycaps). */
object NoteIconNormalizer {
    const val USER_ICON_RULE = "icon must be exactly one emoji"

    /** The longest RGI emoji is 15 UTF-16 chars; anything far longer is refused before it is read. */
    const val MAX_CHARS = 32

    private const val VARIATION_SELECTOR_16 = 0xFE0F
    private const val COMBINING_KEYCAP = 0x20E3
    private const val ZWJ = 0x200D
    private val REGIONAL_INDICATORS = 0x1F1E6..0x1F1FF
    private val KEYCAP_BASES = setOf('#'.code, '*'.code) + ('0'.code..'9'.code)

    /** The trimmed icon; null when it is not exactly one emoji. Callers treat a blank value as no icon first. */
    fun normalize(raw: String): String? {
        val icon = raw.trim()
        if (icon.isEmpty() || icon.length > MAX_CHARS) return null
        if (!isSingleGrapheme(icon)) return null
        val codePoints = icon.codePoints().toArray()
        if (!codePoints.all { Character.isEmoji(it) || Character.isEmojiComponent(it) }) return null
        if (!hasEmojiBase(codePoints) || !placesJoinersAndSelectors(codePoints)) return null
        val first = codePoints.first()
        // a text-default base (©, ☺) is an emoji only with VS16; a flag and a keycap are by their shape
        val presented = Character.isEmojiPresentation(first) || codePoints.getOrNull(1) == VARIATION_SELECTOR_16 ||
                isFlag(codePoints) || isKeycap(codePoints)
        return icon.takeIf { presented }
    }

    /**
     * Starts with an emoji that stands on its own: not a component (a skin tone, a joiner, a selector, a tag), except a
     * flag's pair of regional indicators or a keycap's base digit, `#` or `*`.
     */
    private fun hasEmojiBase(codePoints: IntArray): Boolean {
        val first = codePoints.first()
        if (Character.isEmoji(first) && !Character.isEmojiComponent(first)) return true
        return isFlag(codePoints) || isKeycap(codePoints)
    }

    private fun isFlag(codePoints: IntArray): Boolean =
        codePoints.size == 2 && codePoints.all { it in REGIONAL_INDICATORS }

    /** `1⃣` or `1️⃣`: a base, an optional VS16 and the combining keycap, nothing else. */
    private fun isKeycap(codePoints: IntArray): Boolean {
        val base = codePoints.first()
        if (base !in KEYCAP_BASES) return false
        return codePoints.contentEquals(intArrayOf(base, COMBINING_KEYCAP)) ||
                codePoints.contentEquals(intArrayOf(base, VARIATION_SELECTOR_16, COMBINING_KEYCAP))
    }

    /** VS16 only right after a base, never twice; a ZWJ only between two emoji; the keycap only last. */
    private fun placesJoinersAndSelectors(codePoints: IntArray): Boolean = codePoints.indices.all { index ->
        val codePoint = codePoints[index]
        val previous = codePoints.getOrNull(index - 1)
        val next = codePoints.getOrNull(index + 1)
        when (codePoint) {
            VARIATION_SELECTOR_16 -> previous != null && previous != VARIATION_SELECTOR_16 && previous != ZWJ
            ZWJ -> previous != null && previous != ZWJ && next != null && next != ZWJ && next != VARIATION_SELECTOR_16
            COMBINING_KEYCAP -> index == codePoints.lastIndex && isKeycap(codePoints)
            else -> true
        }
    }

    /** Extended grapheme clusters (UAX #29), so a ZWJ family or a flag counts as one. */
    private fun isSingleGrapheme(text: String): Boolean {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(text)
        iterator.first()
        return iterator.next() == text.length
    }
}
