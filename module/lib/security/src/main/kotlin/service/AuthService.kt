package service

import io.uliss.exception.common.InternalException
import io.uliss.logging.logger.AppLogger
import io.uliss.security.config.SecurityProperties
import io.uliss.security.dto.response.TokenResponse
import io.uliss.security.exception.AuthServerUnavailableException
import io.uliss.security.exception.InvalidAuthorizationCodeException
import io.uliss.security.exception.InvalidRefreshTokenException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.resilience.annotation.Retryable
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import utils.CODE_VERIFIER
import utils.MAX_COOKIE_AGE
import utils.generateCodeChallenge
import utils.generateCodeVerifier
import utils.setCookie
import java.net.URI
import java.net.URLEncoder
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
                            "&code=${URLEncoder.encode(code, Charsets.UTF_8)}" +
                            "&redirect_uri=${securityProperties.redirectUri}" +
                            "&code_verifier=$codeVerifier"
                )
                .getResponseOrThrow()
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
                .getResponseOrThrow()
        } catch (ex: HttpClientErrorException) {
            log.warn("auth service reject refresh ${ex.statusCode}:${ex.responseBodyAsString}", "refresh")
            val err = errorCode(ex)
            if (err == OAuth2ErrorCodes.INVALID_GRANT) {
                throw InvalidRefreshTokenException("refresh token is invalid or expired", ex)
            }
            throw InternalException("auth server error: $err", ex)
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
                    "token=${URLEncoder.encode(refreshToken, Charsets.UTF_8.name())}" +
                            "&token_type_hint=refresh_token"
                )
                .getResponseOrThrow()
        } catch (ex: HttpClientErrorException) {
//            token is already invalid. Ignore exception
            log.warn("auth server refused logout ${ex.statusCode}:${ex.responseBodyAsString}; ignoring", "logout")
        }
    }

    // read the OAuth2 error from the raw body: a manually built exception has no body converter
    private fun errorCode(ex: HttpClientErrorException): String? =
        OAUTH2_ERROR.find(ex.responseBodyAsString)?.groupValues?.get(1)
}

private val OAUTH2_ERROR = Regex(""""error"\s*:\s*"([^"]+)"""")

inline fun <reified T : Any> RestClient.RequestBodySpec.getResponseOrThrow(): T =
    this.exchange { _, res ->
        when {
            res.statusCode.is2xxSuccessful ->
                if (T::class == Unit::class) Unit as T
                else res.bodyTo(T::class.java) ?: throw InternalException("empty response")

            res.statusCode == HttpStatus.UNAUTHORIZED ->
                throw InternalException("invalid client credentials")

            res.statusCode.is5xxServerError ->
                throw AuthServerUnavailableException("auth server unavailable")

            else -> {
                val body = res.bodyTo(ByteArray::class.java) ?: ByteArray(0)
                throw HttpClientErrorException.create(res.statusCode, "", res.headers, body, null)
            }
        }
    }
