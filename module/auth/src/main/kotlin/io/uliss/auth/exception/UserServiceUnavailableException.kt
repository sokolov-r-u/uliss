package io.uliss.auth.exception

import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.OAuth2ErrorCodes

/** No token without the profile identity; the token endpoint answers 503 so the client keeps its grant and retries. */
class UserServiceUnavailableException(cause: Throwable) : OAuth2AuthenticationException(
    OAuth2Error(OAuth2ErrorCodes.TEMPORARILY_UNAVAILABLE, "user service unavailable", null),
    cause,
)
