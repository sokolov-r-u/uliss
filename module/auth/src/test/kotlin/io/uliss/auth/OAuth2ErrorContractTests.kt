package io.uliss.auth

import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.jayway.jsonpath.JsonPath
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import io.grpc.Status
import io.grpc.StatusRuntimeException
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.config.MutableClock
import io.uliss.auth.config.MutableClockConfiguration
import io.uliss.auth.config.TestContainersConfiguration
import io.uliss.auth.filter.TokenRequestTimingFilter
import io.uliss.auth.model.UserEntity
import io.uliss.auth.model.UserStatus
import io.uliss.auth.repository.UserRepository
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.core.OAuth2RefreshToken
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.util.UriComponentsBuilder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class, MutableClockConfiguration::class)
class OAuth2ErrorContractTests {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var clock: MutableClock

    @Autowired
    lateinit var authorizationService: OAuth2AuthorizationService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var registeredClientRepository: RegisteredClientRepository

    @Autowired
    lateinit var userRepository: UserRepository

    @MockitoBean
    lateinit var userServiceBlockingStub: UserServiceGrpc.UserServiceBlockingStub

    /** The auth-user id, as a real login sets it; refresh checks that user. */
    private lateinit var userIdName: String

    @BeforeEach
    fun resetClock() {
        clock.reset()
    }

    @BeforeEach
    fun createUser() {
        val user = userRepository.save(
            UserEntity(email = "contract-${UUID.randomUUID()}@example.com", passwordHash = "hash", status = UserStatus.ACTIVE)
        )
        userIdName = user.id.toString()
    }

    @BeforeEach
    fun stubUserService() {
        // doReturn: re-stubbing after a thenThrow must not call the throwing stub
        Mockito.doReturn(UserInfoResponse.newBuilder().setUserId(UUID.randomUUID().toString()).build())
            .`when`(userServiceBlockingStub).getUserInfo(Mockito.any())
    }

    @Test
    fun `jwks endpoints returns public keys`() {
        mockMvc.get("/oauth2/jwks")
            .andExpect {
                status { isOk() }
                jsonPath("$.keys") { isArray() }
            }
    }

    // ---------- Tier A: token endpoint errors (no valid code) ----------

    @Test
    fun `token with wrong client secret is unauthorized invalid_client`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", "whatever")
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, "wrong-secret"))
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error") { value("invalid_client") }
        }
    }

    @Test
    fun `token with unknown client is unauthorized invalid_client`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", "whatever")
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic("no-such-client", "no-such-secret"))
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error") { value("invalid_client") }
        }
    }

    @Test
    fun `token with garbage authorization code is invalid_grant`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", "definitely-not-a-real-code")
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `token without grant_type is invalid_request`() {
        mockMvc.post("/oauth2/token") {
            param("code", "whatever")
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_request") }
        }
    }

    @Test
    fun `token authorization_code without code is invalid_request`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_request") }
        }
    }

    @Test
    fun `token with unsupported grant_type is rejected`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "password")
            param("username", "someone")
            param("password", "secret")
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            // AS has no password grant -> unsupported_grant_type
            jsonPath("$.error") { value("unsupported_grant_type") }
        }
    }

    @Test
    fun `web client using client_credentials grant is unauthorized_client`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "client_credentials")
            param("scope", "openid")
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("unauthorized_client") }
        }
    }

    @Test
    fun `refresh with invalid refresh token is invalid_grant`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "refresh_token")
            param("refresh_token", "not-a-real-refresh-token")
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `token endpoint logs the request timing including client authentication`() {
        val timingLogger = LoggerFactory.getLogger(TokenRequestTimingFilter::class.java) as Logger
        val logEvents = ListAppender<ILoggingEvent>().apply { start() }
        timingLogger.addAppender(logEvents)
        try {
            mockMvc.post("/oauth2/token") {
                param("grant_type", "refresh_token")
                param("refresh_token", "not-a-real-refresh-token")
                with(httpBasic(WEB_CLIENT, "wrong-secret"))
            }.andExpect { status { isUnauthorized() } }
        } finally {
            timingLogger.detachAppender(logEvents)
        }

        val message = logEvents.list.single().formattedMessage
        assertTrue("grant_type=refresh_token status=401" in message, message)
    }

    // ---------- authorize endpoint ----------

    @Test
    fun `authorize without pkce challenge redirects with invalid_request`() {
        val uri = authorizeUri(
            "response_type" to "code",
            "client_id" to WEB_CLIENT,
            "redirect_uri" to REDIRECT_URI,
            "scope" to "openid",
        )
        val location = mockMvc.get(uri) {
            with(user(userIdName).roles("USER"))
        }.andReturn().response.redirectedUrl

        assertNotNull(location, "authorize must redirect to redirect_uri")
        assert(location.startsWith(REDIRECT_URI)) { "expected redirect to $REDIRECT_URI, was $location" }
        assertEquals("invalid_request", queryParam(location, "error"))
    }

    @Test
    fun `authorize with unknown client is rejected without redirect`() {
        val uri = authorizeUri(
            "response_type" to "code",
            "client_id" to "no-such-client",
            "redirect_uri" to REDIRECT_URI,
            "scope" to "openid",
            "code_challenge" to codeChallenge(VERIFIER),
            "code_challenge_method" to "S256",
        )
        mockMvc.get(uri) {
            with(user(userIdName).roles("USER"))
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `authorize with untrusted redirect_uri is rejected without redirect`() {
        val uri = authorizeUri(
            "response_type" to "code",
            "client_id" to WEB_CLIENT,
            "redirect_uri" to "https://evil.example.com/callback",
            "scope" to "openid",
            "code_challenge" to codeChallenge(VERIFIER),
            "code_challenge_method" to "S256",
        )
        mockMvc.get(uri) {
            with(user(userIdName).roles("USER"))
        }.andExpect {
            status { isBadRequest() }
        }
    }

    // ---------- Tier B: happy path, single-use code, refresh rotation ----------

    @Test
    fun `full authorization_code flow issues tokens`() {
        val code = obtainAuthorizationCode(VERIFIER)

        val json = mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", code)
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        assertNotNull(readOrNull(json, "$.access_token"), "expected access_token")
        assertNotNull(readOrNull(json, "$.refresh_token"), "expected refresh_token")
    }

    @Test
    fun `authorization code is single use - second exchange is invalid_grant`() {
        val code = obtainAuthorizationCode(VERIFIER)

        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", code)
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect { status { isOk() } }

        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", code)
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `token exchange with wrong code_verifier is invalid_grant`() {
        val code = obtainAuthorizationCode(VERIFIER)

        mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", code)
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", OTHER_VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `refresh rotates the refresh token and old one is invalidated`() {
        val code = obtainAuthorizationCode(VERIFIER)
        val first = mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", code)
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString

        val refresh1 = readOrNull(first, "$.refresh_token")
        assertNotNull(refresh1)

        val second = mockMvc.post("/oauth2/token") {
            param("grant_type", "refresh_token")
            param("refresh_token", refresh1)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString

        val refresh2 = readOrNull(second, "$.refresh_token")
        assertNotNull(refresh2)
        assertNotEquals(refresh1, refresh2, "reuseRefreshTokens=false -> refresh must rotate")

        // old refresh no longer works once the retry grace window is over
        clock.advance(GRACE_PASSED)
        mockMvc.post("/oauth2/token") {
            param("grant_type", "refresh_token")
            param("refresh_token", refresh1)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `issued authorization is persisted and readable by a fresh service instance`() {
        val code = obtainAuthorizationCode(VERIFIER)
        val json = mockMvc.post("/oauth2/token") {
            param("grant_type", "authorization_code")
            param("code", code)
            param("redirect_uri", REDIRECT_URI)
            param("code_verifier", VERIFIER)
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        val refreshToken = readOrNull(json, "$.refresh_token")
        assertNotNull(refreshToken)

        // a new instance over the same database stands in for an auth restart or another replica
        val restarted = JdbcOAuth2AuthorizationService(jdbcTemplate, registeredClientRepository)
        val authorization = restarted.findByToken(refreshToken, OAuth2TokenType.REFRESH_TOKEN)

        assertNotNull(authorization, "refresh token must survive an authorization server restart")
        assertEquals(userIdName, authorization.principalName)
    }

    // ---------- access token contents ----------

    @Test
    fun `user access token carries the profile claims from user-service`() {
        val userId = UUID.randomUUID().toString()
        Mockito.`when`(userServiceBlockingStub.getUserInfo(Mockito.any())).thenReturn(
            UserInfoResponse.newBuilder()
                .setUserId(userId)
                .setDisplayName("Alice")
                .setOnboardingRequired(true)
                .build()
        )

        val claims = accessTokenClaims(exchange(obtainAuthorizationCode(VERIFIER)))

        assertEquals(userId, claims.getStringClaim("userId"))
        assertEquals("Alice", claims.getStringClaim("displayName"))
        assertEquals(true, claims.getBooleanClaim("onboardingRequired"))
        assertEquals(listOf("ROLE_USER"), claims.getStringListClaim("roles"))
        assertEquals(listOf(WEB_CLIENT), claims.audience)
    }

    // ---------- user-service outage ----------

    @Test
    fun `code exchange answers 503 while user-service is unavailable and the code stays usable`() {
        val code = obtainAuthorizationCode(VERIFIER)
        Mockito.`when`(userServiceBlockingStub.getUserInfo(Mockito.any()))
            .thenThrow(StatusRuntimeException(Status.UNAVAILABLE))

        exchangeRequest(code).andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.error") { value("temporarily_unavailable") }
        }

        stubUserService()
        exchangeRequest(code).andExpect { status { isOk() } }
    }

    @Test
    fun `refresh answers 503 while user-service is unavailable and the refresh token stays valid`() {
        val refreshToken = readOrNull(exchange(obtainAuthorizationCode(VERIFIER)), "$.refresh_token")
        assertNotNull(refreshToken)
        Mockito.`when`(userServiceBlockingStub.getUserInfo(Mockito.any()))
            .thenThrow(StatusRuntimeException(Status.UNAVAILABLE))

        refreshRequest(refreshToken).andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.error") { value("temporarily_unavailable") }
        }

        stubUserService()
        refreshRequest(refreshToken).andExpect { status { isOk() } }
    }

    // ---------- refresh policy ----------

    @Test
    fun `a disabled user cannot refresh`() {
        val refreshToken = readOrNull(exchange(obtainAuthorizationCode(VERIFIER)), "$.refresh_token")
        assertNotNull(refreshToken)
        val user = userRepository.findById(UUID.fromString(userIdName)).orElseThrow()
        user.status = UserStatus.DISABLED
        userRepository.save(user)

        refreshRequest(refreshToken).andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `reusing a rotated refresh token revokes the whole session`() {
        val refresh1 = readOrNull(exchange(obtainAuthorizationCode(VERIFIER)), "$.refresh_token")
        assertNotNull(refresh1)
        val refresh2 = readOrNull(
            refreshRequest(refresh1).andExpect { status { isOk() } }.andReturn().response.contentAsString,
            "$.refresh_token",
        )
        assertNotNull(refresh2)

        // a stolen copy of the old token shows up: the session cannot tell who is legitimate and ends
        clock.advance(GRACE_PASSED)
        refreshRequest(refresh1).andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
        refreshRequest(refresh2).andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
    }

    @Test
    fun `a refresh repeated with the token it just rotated gets a new pair and keeps the session`() {
        val refresh1 = refreshTokenOf(exchange(obtainAuthorizationCode(VERIFIER)))
        refreshTokenOf(refreshRequest(refresh1).andExpect { status { isOk() } }.andReturn().response.contentAsString)

        // the answer to the first refresh never reached the client, which repeats it
        clock.advance(Duration.ofSeconds(29))
        val retried = refreshTokenOf(
            refreshRequest(refresh1).andExpect { status { isOk() } }.andReturn().response.contentAsString
        )

        refreshRequest(retried).andExpect { status { isOk() } }
    }

    @Test
    fun `a token older than the last rotation revokes the session even within the grace window`() {
        val refresh1 = refreshTokenOf(exchange(obtainAuthorizationCode(VERIFIER)))
        val refresh2 = refreshTokenOf(refreshRequest(refresh1).andReturn().response.contentAsString)
        val refresh3 = refreshTokenOf(refreshRequest(refresh2).andReturn().response.contentAsString)

        refreshRequest(refresh1).andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
        refreshRequest(refresh3).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `a rotated token serves one retry only`() {
        val refresh1 = refreshTokenOf(exchange(obtainAuthorizationCode(VERIFIER)))
        refreshRequest(refresh1).andExpect { status { isOk() } }
        val retried = refreshTokenOf(refreshRequest(refresh1).andReturn().response.contentAsString)

        refreshRequest(refresh1).andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_grant") }
        }
        refreshRequest(retried).andExpect { status { isBadRequest() } }
    }

    @Test
    fun `of two refreshes with one token only the first saved rotation wins, the other is temporarily unavailable`() {
        val refresh1 = refreshTokenOf(exchange(obtainAuthorizationCode(VERIFIER)))
        // both requests loaded the authorization before either saved its rotation
        val first = assertNotNull(authorizationService.findByToken(refresh1, OAuth2TokenType.REFRESH_TOKEN))
        val second = assertNotNull(authorizationService.findByToken(refresh1, OAuth2TokenType.REFRESH_TOKEN))

        authorizationService.save(rotated(first, "first-rotation"))
        val error = assertFailsWith<OAuth2AuthenticationException> {
            authorizationService.save(rotated(second, "second-rotation"))
        }

        assertEquals(OAuth2ErrorCodes.TEMPORARILY_UNAVAILABLE, error.error.errorCode)
        assertNotNull(authorizationService.findByToken("first-rotation", OAuth2TokenType.REFRESH_TOKEN))
        assertNull(authorizationService.findByToken("second-rotation", OAuth2TokenType.REFRESH_TOKEN))
    }

    @Test
    fun `a refresh stores no copy of the token it replaced in the authorization attributes`() {
        val refresh1 = refreshTokenOf(exchange(obtainAuthorizationCode(VERIFIER)))
        refreshRequest(refresh1).andExpect { status { isOk() } }

        val attributes = jdbcTemplate.queryForList("select attributes from oauth2_authorization", String::class.java)
        assertTrue(attributes.none { it?.contains(refresh1) == true }, "the replaced refresh token must not be persisted")
    }

    @Test
    fun `signing out with a just-rotated token still ends the session`() {
        val refresh1 = refreshTokenOf(exchange(obtainAuthorizationCode(VERIFIER)))
        val refresh2 = refreshTokenOf(refreshRequest(refresh1).andReturn().response.contentAsString)

        mockMvc.post("/oauth2/revoke") {
            param("token", refresh1)
            param("token_type_hint", "refresh_token")
            with(httpBasic(WEB_CLIENT, WEB_SECRET))
        }.andExpect { status { isOk() } }

        refreshRequest(refresh2).andExpect { status { isBadRequest() } }
    }

    // ---------- helpers ----------

    private fun exchangeRequest(code: String) = mockMvc.post("/oauth2/token") {
        param("grant_type", "authorization_code")
        param("code", code)
        param("redirect_uri", REDIRECT_URI)
        param("code_verifier", VERIFIER)
        with(httpBasic(WEB_CLIENT, WEB_SECRET))
    }

    /** What the refresh grant saves: the loaded authorization with a new refresh token. */
    private fun rotated(authorization: OAuth2Authorization, refreshToken: String): OAuth2Authorization {
        val now = Instant.now()
        return OAuth2Authorization.from(authorization)
            .refreshToken(OAuth2RefreshToken(refreshToken, now, now.plus(Duration.ofDays(1))))
            .build()
    }

    private fun refreshTokenOf(tokenJson: String): String =
        assertNotNull(readOrNull(tokenJson, "$.refresh_token"), "expected refresh_token")

    private fun exchange(code: String): String =
        exchangeRequest(code).andExpect { status { isOk() } }.andReturn().response.contentAsString

    private fun refreshRequest(refreshToken: String) = mockMvc.post("/oauth2/token") {
        param("grant_type", "refresh_token")
        param("refresh_token", refreshToken)
        with(httpBasic(WEB_CLIENT, WEB_SECRET))
    }

    private fun accessTokenClaims(tokenJson: String): JWTClaimsSet {
        val accessToken = readOrNull(tokenJson, "$.access_token")
        assertNotNull(accessToken, "expected access_token")
        return SignedJWT.parse(accessToken).jwtClaimsSet
    }

    // non-openid scope: OIDC id_token needs a real login (authenticationTime), not the synthetic user()
    private fun obtainAuthorizationCode(verifier: String, scope: String = "profile"): String {
        val uri = authorizeUri(
            "response_type" to "code",
            "client_id" to WEB_CLIENT,
            "redirect_uri" to REDIRECT_URI,
            "scope" to scope,
            "code_challenge" to codeChallenge(verifier),
            "code_challenge_method" to "S256",
        )
        val response = mockMvc.get(uri) {
            with(user(userIdName).roles("USER"))
        }.andReturn().response

        val location = response.redirectedUrl
        assertNotNull(
            location,
            "authorize must redirect with code; status=${response.status} err=${response.errorMessage}"
        )
        return queryParam(location, "code")
            ?: error("no code param in redirect: $location")
    }

    // encoded query string avoids MockMvc.param duplication on GET
    private fun authorizeUri(vararg params: Pair<String, String>): String {
        val builder = UriComponentsBuilder.fromPath("/oauth2/authorize")
        params.forEach { (k, v) -> builder.queryParam(k, v) }
        return builder.build().encode().toUriString()
    }

    private fun queryParam(url: String, name: String): String? =
        UriComponentsBuilder.fromUriString(url).build().queryParams.getFirst(name)

    private fun codeChallenge(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(verifier.toByteArray(StandardCharsets.US_ASCII))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }

    private fun readOrNull(json: String, path: String): String? =
        runCatching { JsonPath.read<Any?>(json, path)?.toString() }.getOrNull()

    companion object {
        val GRACE_PASSED: Duration = Duration.ofSeconds(31)
        const val WEB_CLIENT = "test-web-client"
        const val WEB_SECRET = "test-web-secret-0123456789abcdef0123"
        const val REDIRECT_URI = "http://localhost:3000/callback"

        // PKCE code_verifier: 43-128 unreserved chars
        const val VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX0123456789-._~"
        const val OTHER_VERIFIER = "ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210~_.-"
    }
}
