package service

import io.uliss.exception.common.InternalException
import io.uliss.logging.logger.AppLogger
import io.uliss.security.config.SecurityProperties
import io.uliss.security.dto.response.TokenResponse
import io.uliss.security.exception.AuthServerUnavailableException
import io.uliss.security.exception.InvalidAuthorizationCodeException
import io.uliss.security.exception.InvalidRefreshTokenException
import org.springframework.http.MediaType
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.resilience.annotation.Retryable
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import utils.CODE_VERIFIER
import utils.MAX_COOKIE_AGE
import utils.generateCodeChallenge
import utils.generateCodeVerifier
import utils.setCookie
import java.net.URI
import java.time.Duration

@Service
class AuthService(
    private val securityProperties: SecurityProperties,
) {

    private val clientId get() = securityProperties.authorizationCode.clientId
    private val clientSecret get() = securityProperties.authorizationCode.clientSecret
    private val log = AppLogger.of(AuthService::class)

    private val restClient: RestClient = RestClient.builder()
        .requestFactory(
            SimpleClientHttpRequestFactory().apply {
                setConnectTimeout(Duration.ofSeconds(3))
                setReadTimeout(Duration.ofSeconds(5))
            })
        .build()


    fun createLoginRedirectUrl(): String {
        val verifier = generateCodeVerifier()
        val codeChallenge = generateCodeChallenge(verifier)

        setCookie(CODE_VERIFIER, verifier, securityProperties.secureCookie, MAX_COOKIE_AGE)

        return "${securityProperties.authServerUrl}/oauth2/authorize?" +
                "response_type=code" +
                "&redirect_uri=${securityProperties.redirectUri}" +
                "&client_id=${securityProperties.authorizationCode.clientId}" +
                "&code_challenge=$codeChallenge" +
                "&code_challenge_method=S256"
    }

    @Retryable(
        includes = [AuthServerUnavailableException::class, ResourceAccessException::class],
        maxRetries = 3,
        delay = 500,
        multiplier = 2.0
    )
    fun exchangeCode(code: String, codeVerifier: String): TokenResponse {
        return try {
            restClient.post()
                .uri { URI.create("${securityProperties.authServerUrl}/oauth2/token") }
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .headers { it.setBasicAuth(clientId, clientSecret) }
                .body(
                    "grant_type=authorization_code" +
                            "&code=$code" +
                            "&redirect_uri=${securityProperties.redirectUri}" +
                            "&code_verifier=$codeVerifier"
                )
                .retrieve()
                .body<TokenResponse>()
                ?: throw InternalException("empty response from auth server")
        } catch (ex: HttpClientErrorException) {
            log.warn("auth server rejected exchange code ${ex.statusCode}:${ex.responseBodyAsString}", "exchangeCode")
            throw InvalidAuthorizationCodeException("authorization code is invalid or expired", ex)
        } catch (ex: HttpServerErrorException) {
            throw AuthServerUnavailableException("auth server unavailable", ex)
        }
    }

    @Retryable(
        includes = [AuthServerUnavailableException::class, ResourceAccessException::class],
        maxRetries = 3,
        delay = 500,
        multiplier = 2.0
    )
    fun refresh(refreshToken: String): TokenResponse {
        return try {
            restClient.post()
                .uri { URI.create("${securityProperties.authServerUrl}/oauth2/token") }
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .headers { it.setBasicAuth(clientId, clientSecret) }
                .body(
                    "grant_type=refresh_token" +
                            "&refresh_token=$refreshToken"
                )
                .retrieve()
                .body<TokenResponse>()
                ?: throw InternalException("empty response from auth server")
        } catch (ex: HttpClientErrorException) {
            log.warn("auth service reject refresh ${ex.statusCode}:${ex.responseBodyAsString}", "refresh")
            val err = errorCode(ex)
            if (err == OAuth2ErrorCodes.INVALID_GRANT) {
                throw InvalidRefreshTokenException("refresh token is invalid or expired", ex)
            }
            throw InternalException("auth server error: $err", ex)
        } catch (ex: HttpServerErrorException) {
            throw AuthServerUnavailableException("auth server unavailable", ex)
        }
    }

    @Retryable(
        includes = [AuthServerUnavailableException::class, ResourceAccessException::class],
        maxRetries = 3,
        delay = 500,
        multiplier = 2.0
    )
    fun logout(refreshToken: String) {
        try {
            restClient.post()
                .uri { URI.create("${securityProperties.authServerUrl}/oauth2/revoke") }
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .headers { it.setBasicAuth(clientId, clientSecret) }
                .body(
                    "token=$refreshToken" +
                            "&token_type_hint=refresh_token"
                )
                .retrieve()
                .toBodilessEntity()
        } catch (ex: HttpClientErrorException) {
//            token is already invalid. Ignore exception
            log.warn("auth server refused logout ${ex.statusCode}:${ex.responseBodyAsString}; ignoring", "logout")
        } catch (ex: HttpServerErrorException) {
            throw AuthServerUnavailableException("auth server unavailable", ex)
        }
    }

    private fun errorCode(ex: HttpClientErrorException): String? =
        runCatching { ex.getResponseBodyAs(OAuth2ErrorBody::class.java)?.error }.getOrNull()

    private data class OAuth2ErrorBody(val error: String? = null)
}
