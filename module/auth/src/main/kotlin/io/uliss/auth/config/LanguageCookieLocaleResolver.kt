package io.uliss.auth.config

import io.uliss.auth.utils.LANGUAGE_COOKIE
import io.uliss.auth.utils.SUPPORTED_LANGUAGES
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.servlet.LocaleResolver
import java.util.Locale

/** The language cookie shared with the web app, then the browser's first supported language, then English. */
class LanguageCookieLocaleResolver : LocaleResolver {

    override fun resolveLocale(request: HttpServletRequest): Locale {
        val chosen = request.cookies?.firstOrNull { it.name == LANGUAGE_COOKIE }?.value
        if (chosen in SUPPORTED_LANGUAGES) return Locale.of(chosen)
        if (request.getHeader("Accept-Language") == null) return Locale.ENGLISH
        val browser = request.locales.asSequence().map { it.language }.firstOrNull { it in SUPPORTED_LANGUAGES }
        return Locale.of(browser ?: "en")
    }

    /** The choice is written only by `GET /lang` (`LanguageCookieService`), with the web app's cookie attributes. */
    override fun setLocale(request: HttpServletRequest, response: HttpServletResponse?, locale: Locale?) {
        throw UnsupportedOperationException()
    }
}
