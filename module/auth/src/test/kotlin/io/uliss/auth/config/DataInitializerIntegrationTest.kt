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
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/** The real JDBC repository round-trips settings through JSON; a sync must survive that without rewriting rows. */
@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class DataInitializerIntegrationTest {

    @Autowired
    lateinit var registeredClientRepository: RegisteredClientRepository

    @Autowired
    lateinit var passwordEncoder: PasswordEncoder

    @Value($$"${app.clients.authorization-code.client-id}")
    lateinit var webClientId: String

    @Value($$"${app.clients.authorization-code.client-secret}")
    lateinit var webClientSecret: String

    @Value($$"${app.clients.authorization-code.callback-urls}")
    lateinit var callbackUrls: List<String>

    @Value($$"${app.clients.authorization-code.post-logout-urls}")
    lateinit var postLogoutUrls: List<String>

    @Value($$"${app.clients.m2m.client-id}")
    lateinit var m2mClientId: String

    @Value($$"${app.clients.m2m.client-secret}")
    lateinit var m2mClientSecret: String

    @Test
    fun `a restart over rows already in sync writes nothing`() {
        // application startup has already synced both clients into the database
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

    private fun initializer(repository: RegisteredClientRepository) = DataInitializer(
        registeredClientRepository = repository,
        passwordEncoder = passwordEncoder,
        webClientId = webClientId,
        webClientSecret = webClientSecret,
        callbackUrls = callbackUrls,
        postLogoutUrls = postLogoutUrls,
        m2mClientId = m2mClientId,
        m2mClientSecret = m2mClientSecret,
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
