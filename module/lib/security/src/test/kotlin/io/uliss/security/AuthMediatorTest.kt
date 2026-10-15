package io.uliss.security

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.equalTo
import com.github.tomakehurst.wiremock.client.WireMock.exactly
import com.github.tomakehurst.wiremock.client.WireMock.notContaining
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.github.tomakehurst.wiremock.http.Fault
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
class AuthMediatorTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @BeforeEach
    fun resetStubs() {
        wireMock.resetAll()
    }

    // ---------- GET /oauth2/login ----------

    @Test
    fun `login redirects to authorize and sets code_verifier cookie`() {
        val location = mockMvc.get("/oauth2/login")
            .andExpect {
                status { is3xxRedirection() }
                cookie {
                    exists("code_verifier")
                    httpOnly("code_verifier", true)
                    secure("code_verifier", false)
                    maxAge("code_verifier", 300)
                }
            }
            .andReturn().response.redirectedUrl

        requireNotNull(location)
        assert(location.startsWith("${wireMock.baseUrl()}/oauth2/authorize")) { "redirect: $location" }
        assert(location.contains("response_type=code")) { "redirect: $location" }
        assert(location.contains("code_challenge_method=S256")) { "redirect: $location" }
        assert(location.contains("client_id=$WEB_CLIENT")) { "redirect: $location" }
    }

    @Test
    fun `login binds a random state to the browser with a cookie`() {
        val result = mockMvc.get("/oauth2/login")
            .andExpect {
                cookie {
                    exists(OAUTH_STATE)
                    httpOnly(OAUTH_STATE, true)
                    maxAge(OAUTH_STATE, 300)
                }
            }
            .andReturn().response
        val state = requireNotNull(result.getCookie(OAUTH_STATE)).value

        assert(state.length >= 32) { "state: $state" }
        assert(requireNotNull(result.redirectedUrl).contains("&state=$state")) { "redirect: ${result.redirectedUrl}" }
    }

    @Test
    fun `callback rejects a state that does not match the login cookie`() {
        mockMvc.post("/oauth2/callback") {
            param("code", "auth-code")
            param("state", "forged")
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("AUTHORIZATION_CODE_ERROR") }
        }

        wireMock.verify(exactly(0), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback clears the one-time login cookies`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(400, """{"error":"invalid_grant"}"""))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "auth-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isBadRequest() }
            cookie {
                maxAge(CODE_VERIFIER, 0)
                maxAge(OAUTH_STATE, 0)
            }
        }
    }

    // ---------- POST /oauth2/callback ----------

    @Test
    fun `callback exchanges code and returns tokens`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(200, TOKEN_JSON))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "auth-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isOk() }
            jsonPath("$.access_token") { value("access-abc") }
            jsonPath("$.refresh_token") { value("refresh-xyz") }
            jsonPath("$.expires_in") { value(900) }
        }

        wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback maps invalid_grant to 400 authorization_code_error without leaking AS body`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(400, """{"error":"invalid_grant","error_description":"code expired"}"""))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "expired-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("AUTHORIZATION_CODE_ERROR") }
            jsonPath("$.status") { value(400) }
            jsonPath("$.details") { isEmpty() }
        }
    }

    @Test
    fun `callback maps 401 invalid_client to 500`() {
        // 401 from AS means the mediator's own client credentials are wrong -> server misconfig
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(401, """{"error":"invalid_client"}"""))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }
    }

    @Test
    fun `callback retries on 5xx and finally maps to 500`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(aResponse().withStatus(503))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }

        // 1 call + 3 retries
        wireMock.verify(exactly(4), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback does not retry a dropped response because the code may be consumed`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isServiceUnavailable() }
        }

        wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback maps empty 200 body to 500`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json"))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }

        // InternalException is not retried
        wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback without code_verifier cookie is rejected and still clears the login cookies`() {
        assertIncompleteCallbackRejected(
            params = mapOf("code" to "some-code", "state" to STATE),
            cookies = listOf(Cookie(OAUTH_STATE, STATE)),
        )
    }

    @Test
    fun `callback without state cookie is rejected and still clears the login cookies`() {
        // e.g. the login started before the state cookie existed, or the cookie expired on a slow login page
        assertIncompleteCallbackRejected(
            params = mapOf("code" to "some-code", "state" to STATE),
            cookies = listOf(Cookie(CODE_VERIFIER, "verifier")),
        )
    }

    @Test
    fun `callback without state parameter is rejected and still clears the login cookies`() {
        assertIncompleteCallbackRejected(
            params = mapOf("code" to "some-code"),
            cookies = listOf(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE)),
        )
    }

    @Test
    fun `callback without code parameter is rejected and still clears the login cookies`() {
        assertIncompleteCallbackRejected(
            params = mapOf("state" to STATE),
            cookies = listOf(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, STATE)),
        )
    }

    @Test
    fun `callback with blank state cookie and parameter is rejected`() {
        // an empty state must never match itself
        assertIncompleteCallbackRejected(
            params = mapOf("code" to "some-code", "state" to ""),
            cookies = listOf(Cookie(CODE_VERIFIER, "verifier"), Cookie(OAUTH_STATE, "")),
        )
    }

    @Test
    fun `callback without any login cookie leaves the browser cookies alone`() {
        // a cross-site POST carries no SameSite=Lax cookies; it must not wipe a login running in another tab
        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
            param("state", STATE)
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("AUTHORIZATION_CODE_ERROR") }
            header { doesNotExist("Set-Cookie") }
        }

        wireMock.verify(exactly(0), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    private fun assertIncompleteCallbackRejected(params: Map<String, String>, cookies: List<Cookie>) {
        mockMvc.post("/oauth2/callback") {
            params.forEach { (name, value) -> param(name, value) }
            if (cookies.isNotEmpty()) cookie(*cookies.toTypedArray())
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("AUTHORIZATION_CODE_ERROR") }
            cookie {
                maxAge(CODE_VERIFIER, 0)
                maxAge(OAUTH_STATE, 0)
            }
        }

        wireMock.verify(exactly(0), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    // ---------- POST /oauth2/refresh ----------

    @Test
    fun `refresh returns new tokens`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(200, TOKEN_JSON))
        )

        mockMvc.post("/oauth2/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"old-refresh"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.access_token") { value("access-abc") }
            jsonPath("$.refresh_token") { value("refresh-xyz") }
        }
    }

    @Test
    fun `refresh sends the token as one encoded form value`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(200, TOKEN_JSON))
        )

        mockMvc.post("/oauth2/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"tok&scope=admin"}"""
        }.andExpect {
            status { isOk() }
        }

        wireMock.verify(
            exactly(1),
            postRequestedFor(urlPathEqualTo("/oauth2/token"))
                .withFormParam("refresh_token", equalTo("tok&scope=admin"))
                .withRequestBody(notContaining("&scope="))
        )
    }

    @Test
    fun `callback sends the cookie verifier as one encoded form value`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(200, TOKEN_JSON))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "auth-code")
            param("state", STATE)
            cookie(Cookie(CODE_VERIFIER, "verifier&client_id=other"), Cookie(OAUTH_STATE, STATE))
        }.andExpect {
            status { isOk() }
        }

        wireMock.verify(
            exactly(1),
            postRequestedFor(urlPathEqualTo("/oauth2/token"))
                .withFormParam("code_verifier", equalTo("verifier&client_id=other"))
                .withRequestBody(notContaining("&client_id="))
        )
    }

    @Test
    fun `refresh maps invalid_grant to 401 invalid_refresh_token`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(400, """{"error":"invalid_grant"}"""))
        )

        mockMvc.post("/oauth2/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"revoked"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("INVALID_REFRESH_TOKEN") }
            jsonPath("$.status") { value(401) }
        }
    }

    @Test
    fun `refresh maps any other 4xx from the auth server to 401 so the SPA signs in again`() {
        // invalid_client after a secret rotation, invalid_scope, unauthorized_client, or a 4xx without an OAuth body
        listOf(
            400 to """{"error":"invalid_scope"}""",
            401 to """{"error":"invalid_client"}""",
            400 to """{"error":"unauthorized_client"}""",
            403 to "",
        ).forEach { (status, body) ->
            wireMock.resetAll()
            wireMock.stubFor(post(urlPathEqualTo("/oauth2/token")).willReturn(jsonResponse(status, body)))

            mockMvc.post("/oauth2/refresh") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"refreshToken":"whatever"}"""
            }.andExpect {
                status { isUnauthorized() }
                jsonPath("$.code") { value("INVALID_REFRESH_TOKEN") }
            }
            // a rejected grant is final: no retry
            wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/token")))
        }
    }

    @Test
    fun `refresh retries on 5xx and finally maps to 500`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(aResponse().withStatus(500))
        )

        mockMvc.post("/oauth2/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"whatever"}"""
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }

        wireMock.verify(exactly(4), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `refresh does not retry a read timeout because the token may be rotated`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(200, TOKEN_JSON).withFixedDelay(6_000))
        )

        mockMvc.post("/oauth2/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"whatever"}"""
        }.andExpect {
            status { isServiceUnavailable() }
        }

        wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    // ---------- POST /oauth2/logout ----------

    @Test
    fun `logout revokes token and returns 204`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/revoke"))
                .willReturn(aResponse().withStatus(200))
        )

        mockMvc.post("/oauth2/logout") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"some-refresh"}"""
        }.andExpect {
            status { isNoContent() }
        }

        wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/revoke")))
    }

    @Test
    fun `logout swallows 4xx from AS and still returns 204`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/revoke"))
                .willReturn(jsonResponse(400, """{"error":"invalid_token"}"""))
        )

        mockMvc.post("/oauth2/logout") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"already-invalid"}"""
        }.andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `logout retries on 5xx and finally maps to 500`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/revoke"))
                .willReturn(aResponse().withStatus(500))
        )

        mockMvc.post("/oauth2/logout") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"some-refresh"}"""
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }

        wireMock.verify(exactly(4), postRequestedFor(urlPathEqualTo("/oauth2/revoke")))
    }

    private fun jsonResponse(status: Int, body: String) =
        aResponse().withStatus(status).withHeader("Content-Type", "application/json").withBody(body)

    companion object {
        private const val WEB_CLIENT = "test-web-client"
        private const val CODE_VERIFIER = "code_verifier"
        private const val OAUTH_STATE = "oauth_state"
        private const val STATE = "state-123"
        private const val TOKEN_JSON =
            """{"access_token":"access-abc","refresh_token":"refresh-xyz","expires_in":900,"token_type":"Bearer"}"""

        private val wireMock = WireMockServer(options().dynamicPort()).apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun props(registry: DynamicPropertyRegistry) {
            registry.add("security.oauth2.client.auth-server-public-url") { wireMock.baseUrl() }
            registry.add("security.oauth2.client.auth-server-internal-url") { wireMock.baseUrl() }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wireMock.stop()
        }
    }
}
