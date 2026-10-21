package io.uliss.auth.handler

import io.uliss.auth.service.BrowserSessionLogoutService
import io.uliss.auth.service.SessionTrackingAuthorizationService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.server.authorization.oidc.authentication.OidcLogoutAuthenticationToken
import org.springframework.security.web.authentication.logout.LogoutHandler
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler

/**
 * End-session: revokes every authorization of the ID token's browser session (other tabs included), then signs the
 * browser out as the default handler does. The ID token was already validated by the logout authentication provider.
 */
class BrowserSessionLogoutHandler(
    private val browserSessionLogoutService: BrowserSessionLogoutService,
) : LogoutHandler {

    private val securityContextLogoutHandler = SecurityContextLogoutHandler()

    override fun logout(request: HttpServletRequest, response: HttpServletResponse, authentication: Authentication?) {
        if (authentication !is OidcLogoutAuthenticationToken) return
        authentication.idToken?.getClaim<String>(SessionTrackingAuthorizationService.SID)
            ?.let(browserSessionLogoutService::revokeAuthorizations)
        if (authentication.isPrincipalAuthenticated) {
            securityContextLogoutHandler.logout(request, response, authentication.principal as Authentication)
        }
    }
}
