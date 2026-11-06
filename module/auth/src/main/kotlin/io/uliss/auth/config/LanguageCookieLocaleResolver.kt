package io.uliss.auth.config

import io.uliss.auth.utils.LANGUAGE_COOKIE
import io.uliss.auth.utils.findSupportedLanguage
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.web.servlet.LocaleResolver
import java.util.Locale

/** The language cookie shared with the web app, then the browser's first supported language, then English. */
class LanguageCookieLocaleResolver : LocaleResolver {

    override fun resolveLocale(request: HttpServletRequest): Locale {
        val chosen = request.cookies.orEmpty().asSequence()
            .filter { it.name == LANGUAGE_COOKIE }
            .firstNotNullOfOrNull { findSupportedLanguage(it.value) }
        if (chosen != null) return Locale.of(chosen)
        return Locale.of(findBrowserLanguage(request.getHeader(HttpHeaders.ACCEPT_LANGUAGE)) ?: "en")
    }

    /**
     * The first supported language of `Accept-Language` by weight. Parsed here, not through `getLocales()`: the
     * container answers that with the JVM's locale when the header is missing, blank or unparseable.
     */
    private fun findBrowserLanguage(header: String?): String? {
        if (header.isNullOrBlank()) return null
        val ranges = try {
            Locale.LanguageRange.parse(header)
        } catch (_: IllegalArgumentException) {
            return null
        }
        return ranges.firstNotNullOfOrNull { findSupportedLanguage(it.range) }
    }

    /** The choice is written only by `GET /lang` (`LanguageCookieService`), with the web app's cookie attributes. */
    override fun setLocale(request: HttpServletRequest, response: HttpServletResponse?, locale: Locale?) {
        throw UnsupportedOperationException()
    }
}
