package io.uliss.note_service.util

import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NoteIconNormalizerTest {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "🎷", "📚", "❤️", "☕", "👍🏽", "👨‍👩‍👧", "👩🏻‍❤️‍💋‍👨🏼", "🏳️‍🌈", "🇯🇵", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", "1️⃣", "©️",
        ]
    )
    fun `one emoji, simple or compound, is accepted as it is`(emoji: String) {
        assertEquals(emoji, NoteIconNormalizer.normalize(emoji))
    }

    @Test
    fun `surrounding whitespace is trimmed`() {
        assertEquals("🎷", NoteIconNormalizer.normalize(" \t🎷\n"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["a", "1", "#", "©", "Я", "é", "🎷🎺", "🎷a", "a🎷", "🎷 🎺", "🇯🇵🇫🇷", "🎷\u0301\u0301", ""])
    fun `text, a bare keycap base, two emoji or an emoji with marks is refused`(raw: String) {
        assertNull(NoteIconNormalizer.normalize(raw), "accepted \"$raw\"")
    }

    @Test
    fun `an overlong value is refused without reading it`() {
        assertNull(NoteIconNormalizer.normalize("🎷" + "\u200D🎷".repeat(40)))
    }

    @Property
    fun `a valid emoji passes unchanged and normalizing is idempotent`(@ForAll("emoji") emoji: String) {
        assertEquals(emoji, NoteIconNormalizer.normalize(emoji))
        assertEquals(emoji, NoteIconNormalizer.normalize(checkNotNull(NoteIconNormalizer.normalize(" $emoji "))))
    }

    @Property
    fun `two emoji in a row are never one icon`(@ForAll("emoji") first: String, @ForAll("emoji") second: String) {
        assertNull(NoteIconNormalizer.normalize(first + second))
        assertNull(NoteIconNormalizer.normalize("$first $second"))
    }

    @Property
    fun `an emoji followed or preceded by text is refused`(
        @ForAll("emoji") emoji: String,
        @ForAll("words") word: String,
    ) {
        assertNull(NoteIconNormalizer.normalize(emoji + word))
        assertNull(NoteIconNormalizer.normalize(word + emoji))
    }

    @Property
    fun `anything accepted is a single emoji that normalizes to itself`(@ForAll raw: String) {
        val icon = NoteIconNormalizer.normalize(raw) ?: return
        assertEquals(icon, NoteIconNormalizer.normalize(icon))
        assertEquals(raw.trim(), icon)
    }

    @Provide
    fun emoji(): Arbitrary<String> {
        val skinTones = listOf("", "🏻", "🏼", "🏽", "🏾", "🏿")
        val withTone = Arbitraries.of("👍", "👋", "🙌", "👩", "🧑").flatMap { base ->
            Arbitraries.of(skinTones).map { base + it }
        }
        return Arbitraries.oneOf(
            Arbitraries.of("🎷", "🎸", "📚", "🎬", "💡", "✈️", "💻", "❤️", "☀️", "🏳️‍🌈", "👨‍👩‍👧‍👦", "🇺🇦", "🇫🇷", "#️⃣"),
            withTone,
        )
    }

    @Provide
    fun words(): Arbitrary<String> = Arbitraries.strings().alpha().numeric().ofMinLength(1).ofMaxLength(8)
}
