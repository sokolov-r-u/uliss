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
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.util.UriComponentsBuilder
import java.net.URI
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Signing out of the SPA must end the auth server's browser session, or the next authorize skips the password. */
@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class OidcLogoutTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var userServiceBlockingStub: UserServiceGrpc.UserServiceBlockingStub

    private val email = "oidc-logout-${UUID.randomUUID()}@example.com"

    @BeforeEach
    fun setUp() {
        Mockito.doReturn(UserInfoResponse.newBuilder().setUserId(UUID.randomUUID().toString()).build())
            .`when`(userServiceBlockingStub).getUserInfo(Mockito.any())
        mockMvc.post("/register") {
            param("email", email)
            param("password", PASSWORD)
            with(csrf())
        }.andExpect { status { is3xxRedirection() } }
    }

    @Test
    fun `discovery advertises the end-session and userinfo endpoints`() {
        mockMvc.get("/.well-known/openid-configuration").andExpect {
            status { isOk() }
            jsonPath("$.end_session_endpoint") { value("$ISSUER/connect/logout") }
            jsonPath("$.userinfo_endpoint") { value("$ISSUER/userinfo") }
        }
    }

    @Test
    fun `end-session signs the browser out and returns to the registered page`() {
        val session = signedInSession()
        val tokens = exchange(authorizeWithSession(session))
        val idToken = JsonPath.read<String>(tokens, "$.id_token")

        mockMvc.get(endSessionUri(idToken, POST_LOGOUT_URI)) { this.session = session }.andExpect { redirectedUrl(POST_LOGOUT_URI) }

        // the next authorize in the same browser asks for the password again
        mockMvc.get(authorizeUri()) {
            this.session = session
            accept = MediaType.TEXT_HTML
        }.andExpect { redirectedUrl("/login") }
    }

    @Test
    fun `end-session rejects a post-logout page that is not registered`() {
        val session = signedInSession()
        val idToken = JsonPath.read<String>(exchange(authorizeWithSession(session)), "$.id_token")

        mockMvc.get(endSessionUri(idToken, "https://evil.example.com/")) { this.session = session }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `userinfo answers for an openid access token`() {
        val tokens = exchange(authorizeWithSession(signedInSession()))
        val accessToken = JsonPath.read<String>(tokens, "$.access_token")

        mockMvc.get("/userinfo") {
            header("Authorization", "Bearer $accessToken")
        }.andExpect {
            status { isOk() }
            jsonPath("$.sub") { exists() }
        }
    }

    // the endpoint reads a GET's parameters from the query string only
    private fun endSessionUri(idToken: String, postLogoutUri: String): URI = UriComponentsBuilder
        .fromPath("/connect/logout")
        .queryParam("id_token_hint", idToken)
        .queryParam("client_id", WEB_CLIENT)
        .queryParam("post_logout_redirect_uri", postLogoutUri)
        .build().encode().toUri()

    private fun signedInSession(): MockHttpSession {
        val session = MockHttpSession()
        mockMvc.post("/login") {
            this.session = session
            param("username", email)
            param("password", PASSWORD)
            with(csrf())
        }.andExpect { status { is3xxRedirection() } }
        return session
    }

    private fun authorizeWithSession(session: MockHttpSession): String {
        val location = mockMvc.get(authorizeUri()) { this.session = session }.andReturn().response.redirectedUrl
        assertNotNull(location)
        assertTrue(location.startsWith(REDIRECT_URI), "expected a code redirect, was $location")
        return UriComponentsBuilder.fromUriString(location).build().queryParams.getFirst("code")
            ?: error("no code in $location")
    }

    private fun exchange(code: String): String = mockMvc.post("/oauth2/token") {
        param("grant_type", "authorization_code")
        param("code", code)
        param("redirect_uri", REDIRECT_URI)
        param("code_verifier", VERIFIER)
        with(httpBasic(WEB_CLIENT, WEB_SECRET))
    }.andExpect { status { isOk() } }.andReturn().response.contentAsString
        .also { assertEquals(true, JsonPath.read<String?>(it, "$.id_token") != null, "openid issues an id_token") }

    // a URI, not a String: MockMvc expands a String as a template and would encode the %20 again
    private fun authorizeUri(): URI = UriComponentsBuilder.fromPath("/oauth2/authorize")
        .queryParam("response_type", "code")
        .queryParam("client_id", WEB_CLIENT)
        .queryParam("redirect_uri", REDIRECT_URI)
        .queryParam("scope", "openid profile")
        .queryParam("code_challenge", codeChallenge(VERIFIER))
        .queryParam("code_challenge_method", "S256")
        .build().encode().toUri()

    private fun codeChallenge(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(StandardCharsets.US_ASCII))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }

    private companion object {
        const val PASSWORD = "1234567!Qq"
        const val ISSUER = "http://localhost:9000"
        const val WEB_CLIENT = "test-web-client"
        const val WEB_SECRET = "test-web-secret"
        const val REDIRECT_URI = "http://localhost:3000/callback"
        const val POST_LOGOUT_URI = "http://localhost:3000/signed-out"
        const val VERIFIER = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX0123456789-._~"
    }
}
