package io.uliss.security.controller

import io.uliss.exception.dto.request.LogoutRequest
import io.uliss.exception.dto.request.RefreshRequst
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
        @RequestParam code: String,
        @CookieValue("code_verifier") codeVerifier: String,
    ): ResponseEntity<TokenResponse> {
        val tokenResponse = authService.exchangeCode(code, codeVerifier)
        return ResponseEntity.ok(tokenResponse)
    }

    @PostMapping("/refresh")
    fun refresh(
        @RequestBody request: RefreshRequst
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