package io.uliss.auth.handler

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpStatus
import org.springframework.http.server.ServletServerHttpResponse
import org.springframework.security.core.AuthenticationException
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.core.http.converter.OAuth2ErrorHttpMessageConverter
import org.springframework.security.oauth2.server.authorization.web.authentication.OAuth2ErrorAuthenticationFailureHandler
import org.springframework.security.web.authentication.AuthenticationFailureHandler

/**
 * The token endpoint answers every error with 400, which a client reads as a rejected grant. A temporary outage
 * answers 503 instead: the token is generated before the authorization is saved, so the code or refresh token is
 * still valid and the client may retry.
 */
class TokenErrorResponseHandler : AuthenticationFailureHandler {
    private val default = OAuth2ErrorAuthenticationFailureHandler()
    private val converter = OAuth2ErrorHttpMessageConverter()

    override fun onAuthenticationFailure(
        request: HttpServletRequest,
        response: HttpServletResponse,
        exception: AuthenticationException,
    ) {
        if (exception is OAuth2AuthenticationException &&
            exception.error.errorCode == OAuth2ErrorCodes.TEMPORARILY_UNAVAILABLE
        ) {
            val httpResponse = ServletServerHttpResponse(response)
            httpResponse.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE)
            converter.write(exception.error, null, httpResponse)
        } else {
            default.onAuthenticationFailure(request, response, exception)
        }
    }
}
