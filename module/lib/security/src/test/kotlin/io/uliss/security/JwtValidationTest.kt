package io.uliss.security

import com.github.tomakehurst.wiremock.WireMockServer
import com.github.tomakehurst.wiremock.client.WireMock.okJson
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.options
import com.nimbusds.jose.JWSAlgorithm
import com.nimbusds.jose.JWSHeader
import com.nimbusds.jose.crypto.RSASSASigner
import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jwt.JWTClaimsSet
import com.nimbusds.jwt.SignedJWT
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.time.Duration
import java.time.Instant
import java.util.Date
import java.util.UUID
import com.github.tomakehurst.wiremock.client.WireMock.get as stubGet

@SpringBootTest
@AutoConfigureMockMvc
class JwtValidationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    /** No handler is mapped: an authenticated request reaches MVC and gets 404, a rejected token gets 401. */
    private fun requestWith(token: String) = mockMvc.get("/protected") { header("Authorization", "Bearer $token") }

    @Test
    fun `token from the configured issuer with a user id is accepted`() {
        requestWith(token(ISSUER, UUID.randomUUID().toString())).andExpect { status { isNotFound() } }
    }

    @Test
    fun `token from another issuer is rejected`() {
        requestWith(token("http://evil.test", UUID.randomUUID().toString())).andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `token without a user id is rejected`() {
        requestWith(token(ISSUER, userId = null)).andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `token with a malformed user id is rejected`() {
        requestWith(token(ISSUER, "not-a-uuid")).andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `token issued to another client is rejected`() {
        // e.g. the service token auth signs for user-service gRPC: same key and issuer, other audience
        requestWith(token(ISSUER, UUID.randomUUID().toString(), audience = "user-service"))
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `expired token is rejected`() {
        requestWith(token(ISSUER, UUID.randomUUID().toString(), expiresIn = Duration.ofMinutes(-5)))
            .andExpect { status { isUnauthorized() } }
    }

    companion object {
        // the issuer configured in security-test.yml
        private const val ISSUER = "http://localhost:9000"

        // the web client id configured in security-test.yml; user tokens carry it as `aud`
        private const val WEB_CLIENT = "test-web-client"
        private val signingKey: RSAKey = RSAKeyGenerator(2048).keyID("test-key").generate()

        private val wireMock = WireMockServer(options().dynamicPort()).apply {
            start()
            stubFor(stubGet(urlPathEqualTo("/oauth2/jwks")).willReturn(okJson(JWKSet(signingKey.toPublicJWK()).toString())))
        }

        private fun token(
            issuer: String,
            userId: String?,
            audience: String = WEB_CLIENT,
            expiresIn: Duration = Duration.ofMinutes(5),
        ): String {
            val claims = JWTClaimsSet.Builder()
                .issuer(issuer)
                .subject(UUID.randomUUID().toString())
                .audience(audience)
                .expirationTime(Date.from(Instant.now().plus(expiresIn)))
                .apply { if (userId != null) claim("userId", userId) }
                .build()
            return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(signingKey.keyID).build(), claims)
                .apply { sign(RSASSASigner(signingKey)) }
                .serialize()
        }

        @JvmStatic
        @DynamicPropertySource
        fun props(registry: DynamicPropertyRegistry) {
            registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri") { "${wireMock.baseUrl()}/oauth2/jwks" }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wireMock.stop()
        }
    }
}
