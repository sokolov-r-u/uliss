package service

import io.uliss.exception.common.InternalException
import io.uliss.logging.annotation.Sensitive
import io.uliss.logging.logger.AppLogger
import io.uliss.security.config.SecurityProperties
import io.uliss.security.dto.response.TokenResponse
import io.uliss.security.exception.AuthServerUnavailableException
import io.uliss.security.exception.InvalidAuthorizationCodeException
import io.uliss.security.exception.InvalidClientCredentialsException
import io.uliss.security.exception.InvalidRefreshTokenException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.resilience.annotation.Retryable
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.stereotype.Service
import org.springframework.util.LinkedMultiValueMap
import org.springframework.util.MultiValueMap
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import utils.CODE_VERIFIER
import utils.MAX_COOKIE_AGE
import utils.OAUTH_STATE
import utils.generateCodeChallenge
import utils.generateCodeVerifier
import utils.setCookie
import java.net.ConnectException
import java.net.URI
import java.net.UnknownHostException
import java.net.http.HttpClient
import java.net.http.HttpConnectTimeoutException
import java.security.MessageDigest
import java.time.Duration

@Service
class AuthService(
    private val securityProperties: SecurityProperties,
) {

    private val clientId get() = securityProperties.authorizationCode.clientId
    private val clientSecret get() = securityProperties.authorizationCode.clientSecret
    private val log = AppLogger.of(AuthService::class)

    // JDK client: a connect timeout is a distinct exception type, unlike HttpURLConnection.
    private val restClient: RestClient = RestClient.builder()
        .requestFactory(
            JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                    .version(HttpClient.Version.HTTP_1_1)
                    .connectTimeout(Duration.ofSeconds(3))
                    .build()
            ).apply { setReadTimeout(Duration.ofSeconds(5)) })
        .build()


    fun createLoginRedirectUrl(): String {
        val verifier = generateCodeVerifier()
        val codeChallenge = generateCodeChallenge(verifier)

        // state binds the callback to the browser that started the login (login CSRF).
        val state = generateCodeVerifier()
        setCookie(CODE_VERIFIER, verifier, securityProperties.secureCookie, MAX_COOKIE_AGE)
        setCookie(OAUTH_STATE, state, securityProperties.secureCookie, MAX_COOKIE_AGE)

        return "${securityProperties.authServerPublicUrl}/oauth2/authorize?" +
                "response_type=code" +
                "&redirect_uri=${securityProperties.redirectUri}" +
                "&client_id=${securityProperties.authorizationCode.clientId}" +
                "&code_challenge=$codeChallenge" +
                "&code_challenge_method=S256" +
                "&state=$state"
    }

    /**
     * Rejects a callback whose state differs from the one this browser received at login. A missing or blank
     * value (cookie expired, login started elsewhere) never matches.
     */
    fun verifyState(@Sensitive state: String?, @Sensitive expectedState: String?) {
        if (state.isNullOrBlank() || expectedState.isNullOrBlank()) {
            throw InvalidAuthorizationCodeException("login state is missing")
        }
        if (!MessageDigest.isEqual(state.toByteArray(), expectedState.toByteArray())) {
            throw InvalidAuthorizationCodeException("login state does not match")
        }
    }

    /** The verifier and state are single-use: drop them once the callback has used them. */
    fun clearLoginCookies() {
        setCookie(CODE_VERIFIER, "", securityProperties.secureCookie, 0)
        setCookie(OAUTH_STATE, "", securityProperties.secureCookie, 0)
    }

    // One-time grant: retry only when the request never reached the server (see isConnectFailure).
    @Retryable(
        includes = [AuthServerUnavailableException::class],
        maxRetries = 3,
        delay = 500,
        multiplier = 2.0
    )
    fun exchangeCode(@Sensitive code: String?, @Sensitive codeVerifier: String?): TokenResponse {
        if (code.isNullOrBlank() || codeVerifier.isNullOrBlank()) {
            throw InvalidAuthorizationCodeException("authorization code or verifier is missing")
        }
        return try {
            restClient.post()
                .uri { URI.create("${securityProperties.authServerInternalUrl}/oauth2/token") }
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .headers { it.setBasicAuth(clientId, clientSecret) }
                .body(
                    form(
                        "grant_type" to "authorization_code",
                        "code" to code,
                        "redirect_uri" to securityProperties.redirectUri,
                        "code_verifier" to codeVerifier,
                    )
                )
                .getResponseOrThrow()
        } catch (ex: HttpClientErrorException) {
            log.warn("auth server rejected exchange code ${ex.statusCode}:${ex.responseBodyAsString}", "exchangeCode")
            throw InvalidAuthorizationCodeException("authorization code is invalid or expired", ex)
        } catch (ex: HttpServerErrorException) {
            throw AuthServerUnavailableException("auth server unavailable", ex)
        } catch (ex: ResourceAccessException) {
            throw retryableIfNotSent(ex)
        }
    }

    // Rotating grant: retry only when the request never reached the server (see isConnectFailure).
    @Retryable(
        includes = [AuthServerUnavailableException::class],
        maxRetries = 3,
        delay = 500,
        multiplier = 2.0
    )
    fun refresh(@Sensitive refreshToken: String): TokenResponse {
        return try {
            restClient.post()
                .uri { URI.create("${securityProperties.authServerInternalUrl}/oauth2/token") }
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .headers { it.setBasicAuth(clientId, clientSecret) }
                .body(form("grant_type" to "refresh_token", "refresh_token" to refreshToken))
                .getResponseOrThrow()
        } catch (ex: HttpClientErrorException) {
            throw refreshFailure(ex)
        } catch (ex: InvalidClientCredentialsException) {
            log.error("auth server rejected the mediator client credentials on refresh", "refresh", ex)
            throw InvalidRefreshTokenException("refresh token was rejected: invalid_client", ex)
        } catch (ex: ResourceAccessException) {
            throw retryableIfNotSent(ex)
        }
    }

    @Retryable(
        includes = [AuthServerUnavailableException::class, ResourceAccessException::class],
        maxRetries = 3,
        delay = 500,
        multiplier = 2.0
    )
    fun logout(@Sensitive refreshToken: String) {
        try {
            restClient.post()
                .uri { URI.create("${securityProperties.authServerInternalUrl}/oauth2/revoke") }
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .headers { it.setBasicAuth(clientId, clientSecret) }
                .body(form("token" to refreshToken, "token_type_hint" to "refresh_token"))
                .getResponseOrThrow()
        } catch (ex: HttpClientErrorException) {
//            token is already invalid. Ignore exception
            log.warn("auth server refused logout ${ex.statusCode}:${ex.responseBodyAsString}; ignoring", "logout")
        }
    }

    /** Reads the OAuth2 error from the raw body: a manually built exception has no body converter. */
    /**
     * The token endpoint answers a refresh with 400 (or 401, see [InvalidClientCredentialsException]) only: that
     * rejection ends the session. 408/429 come from a busy server or a proxy and are retried, then 503; any other 4xx
     * is infrastructure misconfiguration (e.g. a wrong URL) and keeps the session.
     */
    private fun refreshFailure(ex: HttpClientErrorException): RuntimeException {
        val status = ex.statusCode.value()
        val err = errorCode(ex)
        return when (status) {
            HttpStatus.BAD_REQUEST.value() -> {
                if (err == OAuth2ErrorCodes.INVALID_GRANT) {
                    log.warn("auth server rejected refresh $status:${ex.responseBodyAsString}", "refresh")
                } else {
                    log.error("auth server rejected refresh $status:${ex.responseBodyAsString}", "refresh")
                }
                InvalidRefreshTokenException("refresh token was rejected: ${err ?: status}", ex)
            }

            HttpStatus.REQUEST_TIMEOUT.value(), HttpStatus.TOO_MANY_REQUESTS.value() ->
                AuthServerUnavailableException("auth server is busy: $status", ex, HttpStatus.SERVICE_UNAVAILABLE)

            else -> {
                log.error("unexpected refresh response $status:${ex.responseBodyAsString}", "refresh")
                InternalException("auth server refresh failed: $status", ex)
            }
        }
    }

    private fun errorCode(ex: HttpClientErrorException): String? =
        OAUTH2_ERROR.find(ex.responseBodyAsString)?.groupValues?.get(1)
}

/**
 * A failure before the request was sent is safe to repeat even for one-time grants. After it was sent
 * (read timeout, reset) the server may have consumed the code or rotated the token, so a repeat fails.
 */
internal fun isConnectFailure(ex: ResourceAccessException): Boolean =
    generateSequence<Throwable>(ex) { it.cause }.any {
        it is ConnectException || it is UnknownHostException || it is HttpConnectTimeoutException
    }

private fun retryableIfNotSent(ex: ResourceAccessException): RuntimeException =
    if (isConnectFailure(ex)) AuthServerUnavailableException("auth server unreachable", ex) else ex

/** Form body encoded by the converter, so user-supplied values cannot add parameters. */
private fun form(vararg params: Pair<String, String>): MultiValueMap<String, String> =
    LinkedMultiValueMap<String, String>().apply { params.forEach { (name, value) -> add(name, value) } }

private val OAUTH2_ERROR = Regex(""""error"\s*:\s*"([^"]+)"""")

inline fun <reified T : Any> RestClient.RequestBodySpec.getResponseOrThrow(): T =
    this.exchange { _, res ->
        when {
            res.statusCode.is2xxSuccessful ->
                if (T::class == Unit::class) Unit as T
                else res.bodyTo(T::class.java) ?: throw InternalException("empty response")

            res.statusCode == HttpStatus.UNAUTHORIZED ->
                throw InvalidClientCredentialsException("invalid client credentials")

            res.statusCode.is5xxServerError ->
                throw AuthServerUnavailableException("auth server unavailable")

            else -> {
                val body = res.bodyTo(ByteArray::class.java) ?: ByteArray(0)
                throw HttpClientErrorException.create(res.statusCode, "", res.headers, body, null)
            }
        }
    }
