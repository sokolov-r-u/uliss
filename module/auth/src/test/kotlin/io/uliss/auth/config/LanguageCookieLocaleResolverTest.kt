package io.uliss.auth.config

import io.uliss.auth.utils.findSupportedLanguage
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequestWrapper
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Assume
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
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
    fun `the first valid language cookie counts, read as the web app reads it`() {
        val request = MockHttpServletRequest().apply {
            setCookies(Cookie("uliss_lang", "xx"), Cookie("uliss_lang", " RU-ru "))
            addHeader("Accept-Language", "en")
        }

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

    @Test
    fun `a blank language header is English too, not the server's own locale`() {
        val request = object : HttpServletRequestWrapper(MockHttpServletRequest().apply {
            addHeader("Accept-Language", " ")
        }) {
            override fun getLocales(): Enumeration<Locale> = Collections.enumeration(listOf(Locale.of("ru")))
        }

        assertEquals(Locale.ENGLISH, resolver.resolveLocale(request))
    }

    @ParameterizedTest
    @CsvSource(
        "'de-DE,de;q=0.9,ru;q=0.5', ru",
        "'en;q=0.2,ru;q=0.8', ru",
        "'de,fr', en",
        "'*', en",
        "';;;', en",
    )
    fun `the first supported browser language by weight, else English`(header: String, expected: String) {
        val request = MockHttpServletRequest().apply { addHeader("Accept-Language", header) }

        assertEquals(Locale.of(expected), resolver.resolveLocale(request))
    }

    @Property
    fun `an unsupported cookie value falls back to the browser languages`(
        @ForAll value: String,
        @ForAll("browserLanguages") browser: String,
    ) {
        Assume.that(findSupportedLanguage(value) == null)
        val request = MockHttpServletRequest().apply {
            setCookies(Cookie("uliss_lang", value))
            addHeader("Accept-Language", "$browser;q=0.9")
        }

        assertEquals(Locale.of(browser), resolver.resolveLocale(request))
    }

    @Provide
    fun browserLanguages(): Arbitrary<String> = Arbitraries.of("en", "ru")
}
