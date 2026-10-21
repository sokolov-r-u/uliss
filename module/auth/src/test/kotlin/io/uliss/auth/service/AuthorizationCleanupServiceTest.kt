package io.uliss.auth.service

import io.uliss.auth.config.TestContainersConfiguration
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.OAuth2AccessToken
import org.springframework.security.oauth2.core.OAuth2RefreshToken
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationCode
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import java.time.Duration
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class AuthorizationCleanupServiceTest @Autowired constructor(
    private val cleanupService: AuthorizationCleanupService,
    private val authorizationService: OAuth2AuthorizationService,
    private val registeredClientRepository: RegisteredClientRepository,
    private val jdbcTemplate: JdbcTemplate,
) {
    private val now = Instant.now()
    private lateinit var client: RegisteredClient

    @BeforeEach
    fun setUp() {
        jdbcTemplate.update("delete from oauth2_authorization")
        client = assertNotNull(registeredClientRepository.findByClientId("test-web-client"))
    }

    @Test
    fun `deletes authorizations whose every token has expired`() {
        save("expired-refresh", accessExpiresIn = Duration.ofDays(-31), refreshExpiresIn = Duration.ofDays(-1))
        save("expired-access-only", accessExpiresIn = Duration.ofMinutes(-1))
        save("expired-code-only", codeExpiresIn = Duration.ofMinutes(-1))

        val deleted = cleanupService.deleteExpired()

        assertEquals(3, deleted)
        assertNull(authorizationService.findById("expired-refresh"))
        assertNull(authorizationService.findById("expired-access-only"))
        assertNull(authorizationService.findById("expired-code-only"))
    }

    @Test
    fun `keeps authorizations with a token that is still valid`() {
        save("live-refresh", accessExpiresIn = Duration.ofMinutes(-1), refreshExpiresIn = Duration.ofDays(1))
        save("live-access", accessExpiresIn = Duration.ofMinutes(5))
        save("live-code", codeExpiresIn = Duration.ofMinutes(5))

        val deleted = cleanupService.deleteExpired()

        assertEquals(0, deleted)
        assertNotNull(authorizationService.findById("live-refresh"))
        assertNotNull(authorizationService.findById("live-access"))
        assertNotNull(authorizationService.findById("live-code"))
    }

    @Test
    fun `keeps authorizations that have no token yet`() {
        // an authorize request in progress: nothing has an expiry, so greatest() is null
        save("pending")

        val deleted = cleanupService.deleteExpired()

        assertEquals(0, deleted)
        assertNotNull(authorizationService.findById("pending"))
    }

    private fun save(
        id: String,
        codeExpiresIn: Duration? = null,
        accessExpiresIn: Duration? = null,
        refreshExpiresIn: Duration? = null,
    ) {
        val builder = OAuth2Authorization.withRegisteredClient(client)
            .id(id)
            .principalName("user-$id")
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .attribute(OAuth2ParameterNames.STATE, "state-$id")
        codeExpiresIn?.let {
            builder.token(OAuth2AuthorizationCode("code-$id", issuedAt(it), now.plus(it)))
        }
        accessExpiresIn?.let {
            builder.accessToken(
                OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "access-$id", issuedAt(it), now.plus(it))
            )
        }
        refreshExpiresIn?.let {
            builder.refreshToken(OAuth2RefreshToken("refresh-$id", issuedAt(it), now.plus(it)))
        }
        authorizationService.save(builder.build())
    }

    /** Issued well before expiry so issuedAt < expiresAt holds for any offset. */
    private fun issuedAt(expiresIn: Duration): Instant = now.plus(expiresIn).minus(Duration.ofDays(60))
}
