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

    /** The trimmed icon; null when it is not exactly one emoji. Callers treat a blank value as no icon first. */
    fun normalize(raw: String): String? {
        val icon = raw.trim()
        if (icon.isEmpty() || icon.length > MAX_CHARS) return null
        if (!isSingleGrapheme(icon)) return null
        val codePoints = icon.codePoints().toArray()
        if (!codePoints.all { Character.isEmoji(it) || Character.isEmojiComponent(it) }) return null
        val first = codePoints.first()
        // a text-default base (digits, ©, ☺) is an emoji only with VS16 or a keycap
        val presented = Character.isEmojiPresentation(first) ||
                VARIATION_SELECTOR_16 in codePoints || COMBINING_KEYCAP in codePoints
        return icon.takeIf { presented }
    }

    /** Extended grapheme clusters (UAX #29), so a ZWJ family or a flag counts as one. */
    private fun isSingleGrapheme(text: String): Boolean {
        val iterator = BreakIterator.getCharacterInstance(Locale.ROOT)
        iterator.setText(text)
        iterator.first()
        return iterator.next() == text.length
    }
}
