package io.uliss.security

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.exactly
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
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

    // ---------- POST /oauth2/callback ----------

    @Test
    fun `callback exchanges code and returns tokens`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(200, TOKEN_JSON))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "auth-code")
            cookie(Cookie(CODE_VERIFIER, "verifier"))
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
            cookie(Cookie(CODE_VERIFIER, "verifier"))
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
            cookie(Cookie(CODE_VERIFIER, "verifier"))
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
            cookie(Cookie(CODE_VERIFIER, "verifier"))
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }

        // 1 call + 3 retries
        wireMock.verify(exactly(4), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback maps empty 200 body to 500`() {
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(aResponse().withStatus(200).withHeader("Content-Type", "application/json"))
        )

        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
            cookie(Cookie(CODE_VERIFIER, "verifier"))
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
        }

        // InternalException is not retried
        wireMock.verify(exactly(1), postRequestedFor(urlPathEqualTo("/oauth2/token")))
    }

    @Test
    fun `callback without code_verifier cookie is 400`() {
        // known gap: raw 400 (MissingRequestCookieException), not ErrorResponse; never reaches AS
        mockMvc.post("/oauth2/callback") {
            param("code", "some-code")
        }.andExpect {
            status { isBadRequest() }
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
    fun `refresh maps non invalid_grant error to 500`() {
        // known gap: non-invalid_grant error on refresh -> 500 INTERNAL_ERROR
        wireMock.stubFor(
            post(urlPathEqualTo("/oauth2/token"))
                .willReturn(jsonResponse(400, """{"error":"invalid_scope"}"""))
        )

        mockMvc.post("/oauth2/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"whatever"}"""
        }.andExpect {
            status { isInternalServerError() }
            jsonPath("$.code") { value("INTERNAL_ERROR") }
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
        private const val TOKEN_JSON =
            """{"access_token":"access-abc","refresh_token":"refresh-xyz","expires_in":900,"token_type":"Bearer"}"""

        private val wireMock = WireMockServer(options().dynamicPort()).apply { start() }

        @JvmStatic
        @DynamicPropertySource
        fun props(registry: DynamicPropertyRegistry) {
            registry.add("security.oauth2.client.auth-server-url") { wireMock.baseUrl() }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wireMock.stop()
        }
    }
}
