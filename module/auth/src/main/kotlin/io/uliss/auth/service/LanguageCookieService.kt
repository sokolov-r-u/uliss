package io.uliss.auth.service

import io.uliss.auth.utils.LANGUAGE_COOKIE
import io.uliss.auth.utils.SUPPORTED_LANGUAGES
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseCookie
import org.springframework.stereotype.Service
import java.net.URI
import java.time.Duration

/**
 * Builds the `uliss_lang` cookie exactly as the web app writes it (design system `localeCookie`): set for the web
 * app's host, so the SPA and these pages on its `auth.` subdomain share one choice.
 */
@Service
class LanguageCookieService(
    @param:Value($$"${app.frontend-url}") frontendUrl: String,
) {
    private val frontend = URI.create(frontendUrl)

    /** `localhost`, IP addresses and dotless hosts take no `Domain` attribute, as in the web app. */
    private val domain: String? = frontend.host.takeUnless { host ->
        host == "localhost" || host.matches(Regex("[\\d.]+")) || ':' in host || '.' !in host
    }

    /** The cookie that stores [language]; null when the interface has no such language. */
    fun findCookieFor(language: String): ResponseCookie? =
        if (language in SUPPORTED_LANGUAGES) cookieFor(language) else null

    private fun cookieFor(language: String): ResponseCookie = ResponseCookie.from(LANGUAGE_COOKIE, language)
        .domain(domain)
        .path("/")
        .maxAge(Duration.ofDays(365))
        .sameSite("Lax")
        .secure(frontend.scheme == "https")
        .httpOnly(false)
        .build()
}
