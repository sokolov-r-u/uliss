package io.uliss.note_service.util

import net.jqwik.api.Assume
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.constraints.AlphaChars
import net.jqwik.api.constraints.IntRange
import net.jqwik.api.constraints.StringLength
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PosterUrlNormalizerPropertyTest {

    @Property(tries = 200)
    fun `a link longer than the limit is refused, one at the limit is accepted`(
        @ForAll @IntRange(min = 1, max = 3000) length: Int,
    ) {
        val prefix = "https://example.com/"
        val url = prefix + "a".repeat(maxOf(0, length - prefix.length))

        val accepted = PosterUrlNormalizer.normalize(url) != null

        assertEquals(url.length <= PosterUrlNormalizer.MAX_CHARS, accepted, "length ${url.length}")
    }

    @Property(tries = 300)
    fun `a link with any scheme but https is refused`(
        @ForAll @AlphaChars @StringLength(min = 1, max = 12) scheme: String,
    ) {
        Assume.that(!scheme.equals("https", ignoreCase = true))

        assertNull(PosterUrlNormalizer.normalize("$scheme://example.com/p.jpg"))
    }
}
