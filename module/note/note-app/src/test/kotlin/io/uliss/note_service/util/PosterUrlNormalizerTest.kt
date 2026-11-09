package io.uliss.note_service.util

import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PosterUrlNormalizerTest {

    @ParameterizedTest
    @ValueSource(
        strings = [
            "https://m.media-amazon.com/images/M/poster.jpg",
            "https://example.com/a%20b/%D0%BF%D0%BE%D1%81%D1%82%D0%B5%D1%80.png?w=600&h=900#top",
            "https://xn--80aswg.xn--p1ai:8443/p.webp",
            "HTTPS://Example.com/P.JPG",
            "https://127.0.0.1/p.png",
        ]
    )
    fun `an https link with a host is accepted as it is`(url: String) {
        assertEquals(url, PosterUrlNormalizer.normalize(url))
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "http://example.com/p.jpg", "ftp://example.com/p.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA",
            "//example.com/p.jpg", "/p.jpg", "example.com/p.jpg", "https:p.jpg", "https:///p.jpg", "",
        ]
    )
    fun `a link that is not absolute https with a host is refused`(raw: String) {
        assertNull(PosterUrlNormalizer.normalize(raw), "accepted \"$raw\"")
    }

    @ParameterizedTest
    @ValueSource(strings = ["https://user:secret@example.com/p.jpg", "https://user@example.com/p.jpg"])
    fun `a link with credentials is refused`(raw: String) {
        assertNull(PosterUrlNormalizer.normalize(raw), "accepted \"$raw\"")
    }

    @Test
    fun `surrounding whitespace is trimmed`() {
        assertEquals("https://example.com/p.jpg", PosterUrlNormalizer.normalize(" \thttps://example.com/p.jpg\n"))
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "https://example.com/a b.jpg", "https://example.com/p.jpg\u0000", "https://example.com/\np.jpg",
            "https://exa mple.com/p.jpg", "https://example.com/p.jpg\u007F",
        ]
    )
    fun `a link with spaces or control characters inside is refused`(raw: String) {
        assertNull(PosterUrlNormalizer.normalize(raw), "accepted \"$raw\"")
    }
}
