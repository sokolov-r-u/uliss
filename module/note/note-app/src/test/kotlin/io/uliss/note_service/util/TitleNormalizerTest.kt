package io.uliss.note_service.util

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TitleNormalizerTest {

    private val emoji = "😀"

    @Test
    fun `normalizeChatTitle trims and collapses inner whitespace`() {
        assertEquals("a b c", TitleNormalizer.normalizeChatTitle("  a \t b   c  "))
    }

    @Test
    fun `normalizeChatTitle uses the first non-blank line`() {
        assertEquals("First line", TitleNormalizer.normalizeChatTitle(" \n\r\n  First   line  \nSecond line"))
    }

    @Test
    fun `normalizeChatTitle keeps a text within the limit unchanged`() {
        assertEquals("short", TitleNormalizer.normalizeChatTitle("short"))
    }

    @Test
    fun `normalizeChatTitle truncates to 50 code points including the ellipsis`() {
        val result = TitleNormalizer.normalizeChatTitle(emoji.repeat(80))

        assertEquals(50, result.codePointCount(0, result.length))
        assertEquals("${emoji.repeat(47)}...", result)
    }

    @Test
    fun `normalizeChatTitle trims trailing whitespace before the ellipsis`() {
        val message = "a".repeat(46) + "    " + "b".repeat(20)

        assertEquals("a".repeat(46) + "...", TitleNormalizer.normalizeChatTitle(message))
    }

    @Test
    fun `normalizeChatTitle does not strip Markdown or quotes from the user's text`() {
        assertEquals("# \"quoted\" heading", TitleNormalizer.normalizeChatTitle("# \"quoted\" heading"))
    }

    @Test
    fun `normalizeChatTitle returns an empty string for blank input`() {
        assertEquals("", TitleNormalizer.normalizeChatTitle(" \n "))
    }

    @Test
    fun `normalizeNoteTitle keeps a clean title unchanged`() {
        assertEquals("Kafka retry strategy", TitleNormalizer.normalizeNoteTitle("Kafka retry strategy", "body"))
    }

    @Test
    fun `normalizeNoteTitle trims and collapses inner whitespace`() {
        assertEquals("Kafka retry strategy", TitleNormalizer.normalizeNoteTitle("  Kafka \t retry   strategy ", "body"))
    }

    @Test
    fun `normalizeNoteTitle uses the first non-blank line of a multi-line title`() {
        assertEquals("Kafka", TitleNormalizer.normalizeNoteTitle("\n Kafka \nretry strategy", "body"))
    }

    @Test
    fun `normalizeNoteTitle strips leading heading markers`() {
        assertEquals("Kafka retry strategy", TitleNormalizer.normalizeNoteTitle("## Kafka retry strategy", "body"))
    }

    @Test
    fun `normalizeNoteTitle strips matching surrounding quotes only`() {
        assertEquals("Title", TitleNormalizer.normalizeNoteTitle("\"Title\"", "body"))
        assertEquals("Title", TitleNormalizer.normalizeNoteTitle("«Title»", "body"))
        assertEquals("\"Title", TitleNormalizer.normalizeNoteTitle("\"Title", "body"))
    }

    @Test
    fun `normalizeNoteTitle truncates with the same limit and ellipsis as chat titles`() {
        val result = requireNotNull(TitleNormalizer.normalizeNoteTitle(emoji.repeat(80), "body"))

        assertEquals(50, result.codePointCount(0, result.length))
        assertEquals("${emoji.repeat(47)}...", result)
    }

    @Test
    fun `normalizeNoteTitle falls back to the first non-blank content line when the title is blank`() {
        assertEquals("First line", TitleNormalizer.normalizeNoteTitle("   ", "\n\nFirst line\nSecond line"))
    }

    @Test
    fun `normalizeNoteTitle falls back to the content when the title is null and strips its heading marker`() {
        assertEquals("Summary heading", TitleNormalizer.normalizeNoteTitle(null, "# Summary heading\nbody"))
    }

    @Test
    fun `normalizeNoteTitle returns null when neither title nor content yields text`() {
        assertNull(TitleNormalizer.normalizeNoteTitle(" ", "##\n  "))
    }

    @Test
    fun `normalizeUserTitle trims and collapses inner whitespace`() {
        assertEquals("Trip to Lisbon", TitleNormalizer.normalizeUserTitle("  Trip \t to\nLisbon  "))
    }

    @Test
    fun `normalizeUserTitle rejects blank input`() {
        assertNull(TitleNormalizer.normalizeUserTitle(" \n\t "))
    }

    @Test
    fun `normalizeUserTitle accepts exactly 50 code points and rejects 51 without truncating`() {
        val fifty = emoji.repeat(50)
        assertEquals(fifty, TitleNormalizer.normalizeUserTitle(fifty))
        assertNull(TitleNormalizer.normalizeUserTitle(fifty + "a"))
    }
}
