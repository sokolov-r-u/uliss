package io.uliss.auth.config

import org.springframework.boot.DefaultApplicationArguments
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.server.authorization.client.InMemoryRegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DataInitializerTest {

    private val encoder = BCryptPasswordEncoder(4)

    @Test
    fun `startup syncs secret, token settings and redirect uris of existing clients`() {
        val repository = InMemoryRegisteredClientRepository(
            staleClient(WEB, AuthorizationGrantType.AUTHORIZATION_CODE, "http://old/callback"),
            staleClient(M2M, AuthorizationGrantType.CLIENT_CREDENTIALS, null),
        )

        initializer(repository).run(DefaultApplicationArguments())

        val web = assertNotNull(repository.findByClientId(WEB))
        assertTrue(encoder.matches("web-secret", web.clientSecret))
        assertEquals(Duration.ofMinutes(15), web.tokenSettings.accessTokenTimeToLive)
        assertEquals(Duration.ofDays(30), web.tokenSettings.refreshTokenTimeToLive)
        assertFalse(web.tokenSettings.isReuseRefreshTokens)
        assertTrue(web.clientSettings.isRequireProofKey)
        assertEquals(setOf("http://old/callback", "http://new/callback"), web.redirectUris)

        val m2m = assertNotNull(repository.findByClientId(M2M))
        assertTrue(encoder.matches("m2m-secret", m2m.clientSecret))
    }

    @Test
    fun `startup keeps an up-to-date secret hash`() {
        val repository = InMemoryRegisteredClientRepository(staleClient("other", AuthorizationGrantType.CLIENT_CREDENTIALS, null))
        initializer(repository).run(DefaultApplicationArguments())
        val hash = repository.findByClientId(WEB)?.clientSecret

        initializer(repository).run(DefaultApplicationArguments())

        assertEquals(hash, repository.findByClientId(WEB)?.clientSecret)
    }

    private fun initializer(repository: InMemoryRegisteredClientRepository) = DataInitializer(
        registeredClientRepository = repository,
        passwordEncoder = encoder,
        webClientId = WEB,
        webClientSecret = "web-secret",
        callbackUrls = listOf("http://new/callback"),
        m2mClientId = M2M,
        m2mClientSecret = "m2m-secret",
    )

    private fun staleClient(clientId: String, grant: AuthorizationGrantType, redirectUri: String?) =
        RegisteredClient.withId(UUID.randomUUID().toString())
            .clientId(clientId)
            .clientSecret(requireNotNull(encoder.encode("old-secret")))
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
            .authorizationGrantType(grant)
            .apply { redirectUri?.let { redirectUri(it) } }
            .build()

    private companion object {
        const val WEB = "web"
        const val M2M = "m2m"
    }
}
