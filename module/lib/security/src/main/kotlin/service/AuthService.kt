package service

import io.uliss.exception.common.InternalException
import io.uliss.security.config.SecurityProperties
import io.uliss.security.dto.response.TokenResponse
import io.uliss.security.exception.AuthServerUnavailableException
import io.uliss.security.exception.InvalidAuthorizationCodeException
import io.uliss.security.exception.InvalidRefreshTokenException
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.MediaType
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.resilience.annotation.Retryable
import org.springframework.stereotype.Service
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.HttpServerErrorException
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import utils.generateCodeChallenge
import utils.generateCodeVerifier
import utils.getCodeVerifierCookie
import java.net.URI
import java.time.Duration

@Service
class AuthService(
    private val securityProperties: SecurityProperties,
) {
    private val restClient: RestClient = RestClient.builder()
        .requestFactory(
            SimpleClientHttpRequestFactory().apply {
                setConnectTimeout(Duration.ofSeconds(3))
                setReadTimeout(Duration.ofSeconds(5))
            })
        .build()

    fun createLoginRedirectUrl(response: HttpServletResponse): String {
        val verifier = generateCodeVerifier()
        val codeChallenge = generateCodeChallenge(verifier)

        response.addCookie(getCodeVerifierCookie(verifier, securityProperties.secureCookie))

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
                .body(
                    "grant_type=authorization_code" +
                            "&code=$code" +
                            "&redirect_uri=${securityProperties.redirectUri}" +
                            "&code_verifier=$codeVerifier" +
                            "&client_id=${securityProperties.authorizationCode.clientId}" +
                            "&client_secret=${securityProperties.authorizationCode.clientSecret}"
                )
                .retrieve()
                .body<TokenResponse>()
                ?: throw InternalException("empty response from auth server")
        } catch (ex: HttpClientErrorException) {
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
                .body(
                    "grant_type=refresh_token" +
                            "&refresh_token=$refreshToken" +
                            "&client_id=${securityProperties.authorizationCode.clientId}" +
                            "&client_secret=${securityProperties.authorizationCode.clientSecret}"
                )
                .retrieve()
                .body<TokenResponse>()
                ?: throw InternalException("empty response from auth server")
        } catch (ex: HttpClientErrorException) {
            throw InvalidRefreshTokenException("refresh token is invalid or expired", ex)
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
                .body(
                    "token=$refreshToken" +
                            "&token_type_hint=refresh_token" +
                            "&client_id=${securityProperties.authorizationCode.clientId}" +
                            "&client_secret=${securityProperties.authorizationCode.clientSecret}"
                )
                .retrieve()
        } catch (_: HttpClientErrorException) {
//            token is already invalid. Ignore exception
        } catch (ex: HttpServerErrorException) {
            throw AuthServerUnavailableException("auth server unavailable", ex)
        }
    }
}
