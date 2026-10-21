package io.uliss.security.service

import io.uliss.logging.annotation.Sensitive
import io.uliss.logging.logger.AppLogger
import io.uliss.security.dto.response.LogoutResponse
import io.uliss.security.exception.AuthServerUnavailableException
import org.springframework.stereotype.Service
import org.springframework.web.client.ResourceAccessException

/**
 * Sign-out: revokes the refresh token best-effort, then hands back the auth server's end-session address. The revoke
 * runs through [AuthService] (its retries apply only through the bean proxy); an auth server still down after them must
 * not keep the browser session alive, so its failure is logged and the end-session address returned anyway.
 */
@Service
class SignOutService(
    private val authService: AuthService,
) {
    private val log = AppLogger.of(SignOutService::class)

    fun signOut(@Sensitive refreshToken: String, @Sensitive idToken: String?): LogoutResponse {
        try {
            authService.logout(refreshToken)
        } catch (ex: AuthServerUnavailableException) {
            log.warn("refresh token not revoked, auth server unavailable; signing out anyway", "signOut")
        } catch (ex: ResourceAccessException) {
            log.warn("refresh token not revoked, auth server unreachable; signing out anyway", "signOut")
        }
        return LogoutResponse(authService.createEndSessionUrl(idToken))
    }
}
