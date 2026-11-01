package io.uliss.auth.exception

import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2ErrorCodes

/**
 * Another refresh of the same authorization saved its rotation first. Nothing is saved; the token endpoint answers 503
 * so the client retries, and the retry passes as a repeat of the just-rotated token.
 */
class ConcurrentRefreshException : OAuth2AuthenticationException(
    OAuth2Error(OAuth2ErrorCodes.TEMPORARILY_UNAVAILABLE, "another refresh of this session finished first", null),
)
