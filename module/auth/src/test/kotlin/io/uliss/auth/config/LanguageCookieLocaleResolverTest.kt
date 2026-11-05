package io.uliss.auth.config

import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequestWrapper
import net.jqwik.api.Assume
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import java.util.Collections
import java.util.Enumeration
import java.util.Locale
import kotlin.test.assertEquals

class LanguageCookieLocaleResolverTest {

    private val resolver = LanguageCookieLocaleResolver()

    @Test
    fun `the language cookie chooses the locale`() {
        val request = MockHttpServletRequest().apply { setCookies(Cookie("uliss_lang", "ru")) }

        assertEquals(Locale.of("ru"), resolver.resolveLocale(request))
    }

    @Test
    fun `without a language header the page is English whatever the server's own locale`() {
        // a servlet container answers getLocales() with its default locale when the browser sends no header
        val request = object : HttpServletRequestWrapper(MockHttpServletRequest()) {
            override fun getLocales(): Enumeration<Locale> = Collections.enumeration(listOf(Locale.of("ru")))
        }

        assertEquals(Locale.ENGLISH, resolver.resolveLocale(request))
    }

    @Property
    fun `an unsupported cookie value falls back to the browser languages`(@ForAll value: String) {
        Assume.that(value != "en" && value != "ru")
        val request = MockHttpServletRequest().apply {
            setCookies(Cookie("uliss_lang", value))
            addHeader("Accept-Language", "ru-RU,ru;q=0.9")
        }

        assertEquals(Locale.of("ru"), resolver.resolveLocale(request))
    }
}
