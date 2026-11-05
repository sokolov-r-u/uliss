package io.uliss.auth.controller

import io.uliss.auth.service.LanguageCookieService
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Controller
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.server.ResponseStatusException

/** The EN | RU switcher of the auth pages: stores the choice for the web app too and reopens the same tab. */
@Controller
class LanguageController(
    private val languageCookieService: LanguageCookieService,
) {

    @GetMapping("/lang")
    fun choose(
        @RequestParam to: String,
        @RequestParam(required = false) from: String?,
        response: HttpServletResponse,
    ): String {
        val cookie = languageCookieService.findCookieFor(to)
            ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported language")
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString())
        // only the two auth tabs: the parameter must never become an open redirect
        return if (from == "register") "redirect:/register" else "redirect:/login"
    }
}
