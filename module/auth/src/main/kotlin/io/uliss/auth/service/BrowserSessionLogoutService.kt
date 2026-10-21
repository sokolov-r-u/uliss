package io.uliss.auth.service

import io.uliss.auth.repository.AuthorizationSessionRepository
import io.uliss.logging.annotation.Sensitive
import io.uliss.logging.logger.AppLogger
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/** Ends every authorization signed in through one browser session, so no tab of it can refresh any more. */
@Service
class BrowserSessionLogoutService(
    private val authorizationService: OAuth2AuthorizationService,
    private val authorizationSessionRepository: AuthorizationSessionRepository,
) {
    private val log = AppLogger.of(BrowserSessionLogoutService::class)

    /** Removes the authorizations of the session [sessionId] (an ID token's `sid`); returns how many went. */
    @Transactional
    fun revokeAuthorizations(@Sensitive sessionId: String): Int {
        val removed = authorizationSessionRepository.findAuthorizationIds(sessionId)
            .mapNotNull(authorizationService::findById)
            .onEach(authorizationService::remove)
            .size
        log.info("revoked {} authorizations of a signed-out browser session", "revokeAuthorizations", removed)
        return removed
    }
}
