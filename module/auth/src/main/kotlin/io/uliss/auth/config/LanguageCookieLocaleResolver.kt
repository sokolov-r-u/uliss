package io.uliss.auth.config

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.servlet.LocaleResolver
import java.util.Locale

class LanguageCookieLocaleResolver : LocaleResolver {

    override fun resolveLocale(request: HttpServletRequest): Locale {
        val chosen = request.cookies?.firstOrNull { it.name == "uliss_lang" }?.value
        if (chosen in SUPPORTED) return Locale.of(chosen)
        if (request.getHeader("Accept-Language") == null) return Locale.ENGLISH
        val browser = request.locales.asSequence().map { it.language }.firstOrNull { it in SUPPORTED }
        return Locale.of(browser ?: "en")
    }

    override fun setLocale(request: HttpServletRequest, response: HttpServletResponse?, locale: Locale?) {
        throw UnsupportedOperationException()
    }

    private companion object {
        val SUPPORTED = setOf("en", "ru")
    }
}
