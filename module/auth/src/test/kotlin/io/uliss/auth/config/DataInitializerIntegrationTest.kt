package io.uliss.auth.config

import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.core.AuthorizationGrantType
import io.uliss.auth.repository.RetiredClientRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import java.util.UUID

/** The real JDBC repository round-trips settings through JSON; a sync must survive that without rewriting rows. */
@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class DataInitializerIntegrationTest {

    @Autowired
    lateinit var registeredClientRepository: RegisteredClientRepository

    @Autowired
    lateinit var passwordEncoder: PasswordEncoder

    @Autowired
    lateinit var authorizationService: OAuth2AuthorizationService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Value($$"${app.clients.authorization-code.client-id}")
    lateinit var webClientId: String

    @Value($$"${app.clients.authorization-code.client-secret}")
    lateinit var webClientSecret: String

    @Value($$"${app.clients.authorization-code.callback-urls}")
    lateinit var callbackUrls: List<String>

    @Value($$"${app.clients.authorization-code.post-logout-urls}")
    lateinit var postLogoutUrls: List<String>

    @Autowired
    lateinit var retiredClientRepository: RetiredClientRepository

    @Test
    fun `a restart over rows already in sync writes nothing`() {
        // application startup has already synced the client into the database
        val counting = CountingWrites(registeredClientRepository)

        initializer(counting).run(DefaultApplicationArguments())

        assertEquals(0, counting.saves)
    }

    @Test
    fun `a stale stored client is cleaned in the database and then stays stable`() {
        val synced = assertNotNull(registeredClientRepository.findByClientId(webClientId))
        registeredClientRepository.save(
            RegisteredClient.from(synced)
                .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                .scope("admin")
                .redirectUri("http://stale/callback")
                .build()
        )

        initializer(registeredClientRepository).run(DefaultApplicationArguments())
        val counting = CountingWrites(registeredClientRepository)
        initializer(counting).run(DefaultApplicationArguments())

        val cleaned = assertNotNull(registeredClientRepository.findByClientId(webClientId))
        assertEquals(synced, cleaned)
        assertEquals(0, counting.saves)
    }

    @Test
    fun `a stored client missing from config is removed with its authorizations`() {
        val synced = assertNotNull(registeredClientRepository.findByClientId(webClientId))
        val retired = RegisteredClient.withId(UUID.randomUUID().toString())
            .clientId("retired-${UUID.randomUUID()}")
            .clientSecret("{noop}secret")
            .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
            .build()
        registeredClientRepository.save(retired)
        val authorization = OAuth2Authorization.withRegisteredClient(retired)
            .principalName(retired.clientId)
            .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
            .build()
        authorizationService.save(authorization)

        initializer(registeredClientRepository).run(DefaultApplicationArguments())

        assertNull(registeredClientRepository.findByClientId(retired.clientId))
        assertNull(authorizationService.findById(authorization.id))
        assertEquals(synced, registeredClientRepository.findByClientId(webClientId))
    }

    private fun initializer(repository: RegisteredClientRepository) = DataInitializer(
        registeredClientRepository = repository,
        passwordEncoder = passwordEncoder,
        webClientId = webClientId,
        webClientSecret = webClientSecret,
        callbackUrls = callbackUrls,
        postLogoutUrls = postLogoutUrls,
        retiredClientRepository = retiredClientRepository,
    )

    private class CountingWrites(private val delegate: RegisteredClientRepository) :
        RegisteredClientRepository by delegate {
        var saves = 0
            private set

        override fun save(registeredClient: RegisteredClient) {
            saves++
            delegate.save(registeredClient)
        }
    }
}
