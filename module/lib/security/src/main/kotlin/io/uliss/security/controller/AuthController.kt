package io.uliss.security.controller

import io.uliss.security.dto.request.LogoutRequest
import io.uliss.security.dto.request.RefreshRequest
import io.uliss.security.dto.response.TokenResponse
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.CookieValue
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import service.AuthService
import utils.CODE_VERIFIER
import utils.OAUTH_STATE

@RestController
@RequestMapping("/oauth2")
class AuthController(
    val authService: AuthService,
) {

    @GetMapping("/login")
    fun login(response: HttpServletResponse) {
        val url = authService.createLoginRedirectUrl()
        response.sendRedirect(url)
    }

    @PostMapping("/callback")
    fun callback(
        // Optional so a missing value is rejected inside the try and the login cookies are still cleared.
        @RequestParam(required = false) code: String?,
        @RequestParam(required = false) state: String?,
        @CookieValue(CODE_VERIFIER, required = false) codeVerifier: String?,
        @CookieValue(OAUTH_STATE, required = false) expectedState: String?,
    ): ResponseEntity<TokenResponse> {
        try {
            authService.verifyState(state, expectedState)
            return ResponseEntity.ok(authService.exchangeCode(code, codeVerifier))
        } finally {
            // Only a browser that holds a login cookie has a login to end; a cross-site POST without them
            // must not wipe a login in progress.
            if (codeVerifier != null || expectedState != null) authService.clearLoginCookies()
        }
    }

    @PostMapping("/refresh")
    fun refresh(
        @RequestBody request: RefreshRequest
    ): ResponseEntity<TokenResponse> {
        val tokenResponse = authService.refresh(request.refreshToken)
        return ResponseEntity.ok(tokenResponse)

    }

    @PostMapping("/logout")
    fun logout(@RequestBody request: LogoutRequest): ResponseEntity<Void> {
        authService.logout(request.refreshToken)
        return ResponseEntity.noContent().build()
    }
}