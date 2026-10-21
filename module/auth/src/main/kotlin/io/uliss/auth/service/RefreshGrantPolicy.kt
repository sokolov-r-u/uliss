package io.uliss.auth.service

import io.uliss.auth.model.UserStatus
import io.uliss.auth.repository.UserRepository
import io.uliss.logging.logger.AppLogger
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationCode
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.util.UUID

/**
 * Rules a refresh grant must pass beyond token validity. Rotation gives every refresh a fresh 30-day token, so without
 * an absolute limit a session never ends; and only the form login checks the user's status.
 */
@Service
class RefreshGrantPolicy(
    private val userRepository: UserRepository,
    private val clock: Clock,
) {
    private val log = AppLogger.of(RefreshGrantPolicy::class)

    fun checkRefresh(authorization: OAuth2Authorization) {
        val userId = runCatching { UUID.fromString(authorization.principalName) }.getOrNull()
            ?: reject("principal is not a user id")
        val user = userRepository.findById(userId).orElse(null) ?: reject("user not found")
        if (user.status == UserStatus.DISABLED) reject("user is disabled")

        // the code stays in the authorization after the exchange, so its issue time is the sign-in time
        val signedInAt = authorization.getToken(OAuth2AuthorizationCode::class.java)?.token?.issuedAt
        if (signedInAt != null && clock.instant().isAfter(signedInAt.plus(SESSION_LIFETIME))) {
            reject("session is older than $SESSION_LIFETIME")
        }
    }

    private fun reject(reason: String): Nothing {
        log.info("refresh rejected: {}", "checkRefresh", reason)
        throw OAuth2AuthenticationException(OAuth2ErrorCodes.INVALID_GRANT)
    }

    companion object {
        /** Sign in with the password again at least this often, however active the session is. */
        val SESSION_LIFETIME: Duration = Duration.ofDays(90)
    }
}
