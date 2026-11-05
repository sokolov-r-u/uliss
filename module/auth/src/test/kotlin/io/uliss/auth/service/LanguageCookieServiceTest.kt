package io.uliss.auth.service

import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LanguageCookieServiceTest {

    @Test
    fun `the cookie is the one the web app writes, for the web app's host`() {
        val cookie = assertNotNull(LanguageCookieService("https://uliss.home").findCookieFor("ru"))

        assertEquals("uliss_lang", cookie.name)
        assertEquals("ru", cookie.value)
        assertEquals("uliss.home", cookie.domain)
        assertEquals("/", cookie.path)
        assertEquals(Duration.ofDays(365), cookie.maxAge)
        assertEquals("Lax", cookie.sameSite)
        assertTrue(cookie.isSecure)
        assertFalse(cookie.isHttpOnly, "the web app reads the choice from document.cookie")
    }

    @ParameterizedTest
    @ValueSource(strings = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://web:80"])
    fun `a host that takes no Domain attribute keeps a host-only cookie`(frontendUrl: String) {
        val cookie = assertNotNull(LanguageCookieService(frontendUrl).findCookieFor("en"))

        assertNull(cookie.domain)
        assertFalse(cookie.isSecure)
    }
}
