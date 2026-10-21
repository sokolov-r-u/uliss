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

/**
 * The signing keys come from the auth server; a cold or busy one may take more than Nimbus's default 500 ms to answer.
 * That must not reject the user's token.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SlowJwksTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `a token is accepted when the key set takes longer than half a second to arrive`() {
        // no handler is mapped: an authenticated request reaches MVC and gets 404
        mockMvc.get("/protected") { header("Authorization", "Bearer ${token()}") }
            .andExpect { status { isNotFound() } }
    }

    companion object {
        private val signingKey: RSAKey = RSAKeyGenerator(2048).keyID("slow-key").generate()

        private val wireMock = WireMockServer(options().dynamicPort()).apply {
            start()
            stubFor(stubGet(urlPathEqualTo("/oauth2/jwks"))
                .willReturn(okJson(JWKSet(signingKey.toPublicJWK()).toString()).withFixedDelay(JWKS_DELAY_MS)))
        }

        private fun token(): String {
            val claims = JWTClaimsSet.Builder()
                // the issuer and web client configured in security-test.yml
                .issuer("http://localhost:9000")
                .audience("test-web-client")
                .subject(UUID.randomUUID().toString())
                .claim("userId", UUID.randomUUID().toString())
                .expirationTime(Date.from(Instant.now().plus(Duration.ofMinutes(5))))
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

        private const val JWKS_DELAY_MS = 1500
    }
}
