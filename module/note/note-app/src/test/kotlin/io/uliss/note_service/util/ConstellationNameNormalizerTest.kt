package io.uliss.note_service.util

import net.jqwik.api.ForAll
import net.jqwik.api.Property
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ConstellationNameNormalizerTest {

    @Test
    fun `trims the name and collapses inner whitespace`() {
        assertEquals("Glam rock", ConstellationNameNormalizer.normalize("  Glam \t\n rock "))
    }

    @Test
    fun `a blank name is rejected`() {
        assertNull(ConstellationNameNormalizer.normalize(" \t "))
    }

    @Test
    fun `the limit is 40 code points, not UTF-16 chars`() {
        val emoji = "🎵"
        assertEquals(emoji.repeat(40), ConstellationNameNormalizer.normalize(emoji.repeat(40)))
        assertNull(ConstellationNameNormalizer.normalize(emoji.repeat(41)))
        assertEquals("a".repeat(40), ConstellationNameNormalizer.normalize("a".repeat(40)))
        assertNull(ConstellationNameNormalizer.normalize("a".repeat(41)))
    }

    @Property
    fun `normalizing a normalized name changes nothing`(@ForAll raw: String) {
        val once = ConstellationNameNormalizer.normalize(raw) ?: return
        assertEquals(once, ConstellationNameNormalizer.normalize(once))
    }
}
