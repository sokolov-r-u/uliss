package io.uliss.user_service.grpc

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
import io.grpc.ManagedChannel
import io.grpc.Status
import io.grpc.StatusRuntimeException
import io.grpc.inprocess.InProcessChannelBuilder
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserServiceAuth
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.user_service.config.TestContainersConfiguration
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.aop.support.AopUtils
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.grpc.client.interceptor.security.BearerTokenAuthenticationInterceptor
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.time.Instant
import java.util.Date
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import com.github.tomakehurst.wiremock.client.WireMock.get as stubGet

@Tag("integration")
@SpringBootTest(properties = ["spring.grpc.server.inprocess.name=$IN_PROCESS_NAME"])
@Import(TestContainersConfiguration::class)
class UserGrpcSecurityTest {

    @Autowired
    lateinit var grpcService: UserGrpcService

    private val channels = mutableListOf<ManagedChannel>()

    @AfterEach
    fun tearDown() {
        channels.forEach { it.shutdownNow() }
    }

    @Test
    fun `service token from auth is accepted`() {
        val response = call(token())

        assertTrue(response.userId.isNotBlank())
        UUID.fromString(response.userId)
    }

    @Test
    fun `call tracing does not proxy the grpc service`() {
        // a proxy cannot override the stub's final bindService and logs a warning at every startup
        assertFalse(AopUtils.isAopProxy(grpcService))
    }

    @Test
    fun `call without a token is unauthenticated`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token = null)
    }

    @Test
    fun `user token without the user-service audience is rejected`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token(audience = "uliss-web", scope = null, userId = UUID.randomUUID()))
    }

    @Test
    fun `token without an audience is rejected`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token(audience = null))
    }

    @Test
    fun `service token without the user info scope is denied`() {
        assertStatus(Status.Code.PERMISSION_DENIED, token(scope = "other"))
    }

    @Test
    fun `service token from another issuer is rejected`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token(issuer = "http://evil.test"))
    }

    @Test
    fun `a token with the service claims but another subject is rejected`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token(subject = "note-service"))
    }

    @Test
    fun `a token signed with an unknown key is rejected`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token(key = RSAKeyGenerator(2048).keyID("other-key").generate()))
    }

    @Test
    fun `expired service token is rejected`() {
        assertStatus(Status.Code.UNAUTHENTICATED, token(expiresAt = Instant.now().minusSeconds(600)))
    }

    private fun assertStatus(expected: Status.Code, token: String?) {
        val ex = assertFailsWith<StatusRuntimeException> { call(token) }
        assertEquals(expected, ex.status.code)
    }

    private fun call(token: String?) = stub(token).getUserInfo(
        UserInfoRequest.newBuilder().setAuthId(UUID.randomUUID().toString()).build()
    )

    private fun stub(token: String?): UserServiceGrpc.UserServiceBlockingStub {
        val builder = InProcessChannelBuilder.forName(IN_PROCESS_NAME).directExecutor()
        if (token != null) builder.intercept(BearerTokenAuthenticationInterceptor(token))
        return UserServiceGrpc.newBlockingStub(builder.build().also { channels += it })
    }

    companion object {
        // the issuer configured in security-test.yml
        private const val ISSUER = "http://localhost:9000"
        private val signingKey: RSAKey = RSAKeyGenerator(2048).keyID("test-key").generate()

        private val wireMock = WireMockServer(options().dynamicPort()).apply {
            start()
            stubFor(stubGet(urlPathEqualTo("/oauth2/jwks")).willReturn(okJson(JWKSet(signingKey.toPublicJWK()).toString())))
        }

        @JvmStatic
        @DynamicPropertySource
        fun jwks(registry: DynamicPropertyRegistry) {
            registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri") { "${wireMock.baseUrl()}/oauth2/jwks" }
        }

        @JvmStatic
        @AfterAll
        fun stopWireMock() {
            wireMock.stop()
        }

        private fun token(
            issuer: String = ISSUER,
            audience: String? = UserServiceAuth.AUDIENCE,
            scope: String? = UserServiceAuth.USER_INFO_SCOPE,
            userId: UUID? = null,
            expiresAt: Instant = Instant.now().plusSeconds(300),
            subject: String = UserServiceAuth.SUBJECT,
            key: RSAKey = signingKey,
        ): String {
            val claims = JWTClaimsSet.Builder()
                .issuer(issuer)
                .subject(subject)
                .apply { if (audience != null) audience(audience) }
                .expirationTime(Date.from(expiresAt))
                .apply { if (scope != null) claim("scope", scope) }
                .apply { if (userId != null) claim("userId", userId.toString()) }
                .build()
            return SignedJWT(JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.keyID).build(), claims)
                .apply { sign(RSASSASigner(key)) }
                .serialize()
        }
    }
}

private const val IN_PROCESS_NAME = "user-grpc-security-test"
