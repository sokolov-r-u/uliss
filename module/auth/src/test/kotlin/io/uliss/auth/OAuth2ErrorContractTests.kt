package io.uliss.auth

import com.jayway.jsonpath.JsonPath
import io.uliss.api.user.v1.UserInfoResponse
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.config.TestContainersConfiguration
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.util.UriComponentsBuilder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class OAuth2ErrorContractTests {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var userServiceBlockingStub: UserServiceGrpc.UserServiceBlockingStub

    @BeforeEach
    fun stubUserService() {
        Mockito.`when`(userServiceBlockingStub.getUserInfo(Mockito.any()))
            .thenReturn(UserInfoResponse.newBuilder().setUserId(UUID.randomUUID().toString()).build())
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
    fun `m2m client requesting scope outside internal is invalid_scope`() {
        mockMvc.post("/oauth2/token") {
            param("grant_type", "client_credentials")
            param("scope", "profile")
            with(httpBasic(M2M_CLIENT, M2M_SECRET))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error") { value("invalid_scope") }
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
            with(user("alice@example.com").roles("USER"))
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
            with(user("alice@example.com").roles("USER"))
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
            with(user("alice@example.com").roles("USER"))
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

        // old refresh no longer works
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
    fun `m2m client_credentials issues access token without refresh`() {
        val json = mockMvc.post("/oauth2/token") {
            param("grant_type", "client_credentials")
            param("scope", "internal")
            with(httpBasic(M2M_CLIENT, M2M_SECRET))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString

        assertNotNull(readOrNull(json, "$.access_token"), "expected access_token")
        assertEquals(null, readOrNull(json, "$.refresh_token"), "client_credentials -> no refresh")
    }

    // ---------- helpers ----------

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
            with(user("alice@example.com").roles("USER"))
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
        const val WEB_CLIENT = "test-web-client"
        const val WEB_SECRET = "test-web-secret"
        const val M2M_CLIENT = "test-m2m-client"
        const val M2M_SECRET = "test-m2m-secret"
        const val REDIRECT_URI = "http://localhost:3000/callback"

        // PKCE code_verifier: 43-128 unreserved chars
        const val VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX0123456789-._~"
        const val OTHER_VERIFIER = "ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210~_.-"
    }
}
