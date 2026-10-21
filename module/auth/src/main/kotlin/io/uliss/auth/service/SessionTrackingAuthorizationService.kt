package io.uliss.auth.service

import io.uliss.auth.repository.AuthorizationSessionRepository
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService

/**
 * Remembers the browser session an authorization was signed in through: the `sid` of its ID token. Several tabs of
 * one browser each get their own authorization from the same session, and end-session must revoke all of them.
 */
class SessionTrackingAuthorizationService(
    private val delegate: OAuth2AuthorizationService,
    private val authorizationSessionRepository: AuthorizationSessionRepository,
) : OAuth2AuthorizationService by delegate {

    override fun save(authorization: OAuth2Authorization) {
        delegate.save(authorization)
        authorization.getToken(OidcIdToken::class.java)?.token?.getClaim<String>(SID)
            ?.let { authorizationSessionRepository.save(authorization.id, it) }
    }

    companion object {
        const val SID = "sid"
    }
}
