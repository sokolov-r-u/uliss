package io.uliss.auth.config

import org.springframework.boot.DefaultApplicationArguments
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.server.authorization.client.InMemoryRegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings
import java.time.Instant
import java.time.Duration
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DataInitializerTest {

    private val encoder = TEST_ENCODER

    @Test
    fun `startup replaces secret, token settings and redirect uris of existing clients with config`() {
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
        assertEquals(setOf("http://new/callback"), web.redirectUris)

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

    @Test
    fun `startup removes grant types, scopes, auth methods and logout uris the web client config does not have`() {
        // e.g. added by hand for debugging or left by an older initializer
        val stale = RegisteredClient.from(staleClient(WEB, AuthorizationGrantType.AUTHORIZATION_CODE, "http://new/callback"))
            .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
            .scope("admin")
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
            .postLogoutRedirectUri("http://old/logout")
            .build()
        val repository = InMemoryRegisteredClientRepository(stale)

        initializer(repository).run(DefaultApplicationArguments())

        val web = assertNotNull(repository.findByClientId(WEB))
        assertEquals(setOf(AuthorizationGrantType.AUTHORIZATION_CODE, AuthorizationGrantType.REFRESH_TOKEN), web.authorizationGrantTypes)
        assertEquals(setOf("openid", "profile"), web.scopes)
        assertEquals(setOf(ClientAuthenticationMethod.CLIENT_SECRET_BASIC), web.clientAuthenticationMethods)
        assertEquals(setOf("http://new/signed-out"), web.postLogoutRedirectUris)
    }

    @Test
    fun `startup resets the m2m client to client credentials with the internal scope only`() {
        val stale = RegisteredClient.from(staleClient(M2M, AuthorizationGrantType.AUTHORIZATION_CODE, "http://m2m/callback"))
            .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
            .scope("openid")
            .clientSettings(ClientSettings.builder().requireProofKey(false).requireAuthorizationConsent(true).build())
            .build()
        val repository = InMemoryRegisteredClientRepository(stale)

        initializer(repository).run(DefaultApplicationArguments())

        val m2m = assertNotNull(repository.findByClientId(M2M))
        assertEquals(setOf(AuthorizationGrantType.CLIENT_CREDENTIALS), m2m.authorizationGrantTypes)
        assertEquals(setOf("internal"), m2m.scopes)
        assertTrue(m2m.redirectUris.isEmpty())
        assertFalse(m2m.clientSettings.isRequireAuthorizationConsent)
    }

    @Test
    fun `startup keeps the client id and issue time so stored authorizations stay linked`() {
        val issuedAt = Instant.parse("2026-01-01T00:00:00Z")
        val stale = RegisteredClient.from(staleClient(WEB, AuthorizationGrantType.AUTHORIZATION_CODE, "http://old/callback"))
            .clientIdIssuedAt(issuedAt)
            .build()
        val repository = InMemoryRegisteredClientRepository(stale)

        initializer(repository).run(DefaultApplicationArguments())

        val web = assertNotNull(repository.findByClientId(WEB))
        assertEquals(stale.id, web.id)
        assertEquals(issuedAt, web.clientIdIssuedAt)
    }

    @Test
    fun `startup does not rewrite clients that already match config`() {
        val repository = CountingRegisteredClientRepository()
        initializer(repository).run(DefaultApplicationArguments())
        val savesOnFirstStart = repository.saves

        initializer(repository).run(DefaultApplicationArguments())

        assertEquals(2, savesOnFirstStart)
        assertEquals(savesOnFirstStart, repository.saves)
    }

    @Test
    fun `startup rehashes a matching secret stored with a weaker encoding`() {
        // e.g. the BCrypt strength was raised: the old hash still matches but must not stay forever
        val weakHash = requireNotNull(BCryptPasswordEncoder(4).encode("web-secret"))
        val stale = RegisteredClient.from(staleClient(WEB, AuthorizationGrantType.AUTHORIZATION_CODE, "http://new/callback"))
            .clientSecret(weakHash)
            .build()
        val repository = InMemoryRegisteredClientRepository(stale)
        val strongerEncoder = BCryptPasswordEncoder(5)

        initializer(repository, strongerEncoder).run(DefaultApplicationArguments())

        val web = assertNotNull(repository.findByClientId(WEB))
        assertNotEquals(weakHash, web.clientSecret)
        assertTrue(strongerEncoder.matches("web-secret", web.clientSecret))
        assertFalse(strongerEncoder.upgradeEncoding(web.clientSecret))
    }

    private fun initializer(
        repository: RegisteredClientRepository,
        passwordEncoder: PasswordEncoder = encoder,
    ) = DataInitializer(
        registeredClientRepository = repository,
        passwordEncoder = passwordEncoder,
        webClientId = WEB,
        webClientSecret = "web-secret",
        callbackUrls = listOf("http://new/callback"),
        postLogoutUrls = listOf("http://new/signed-out"),
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

}

internal const val WEB = "web"
internal const val M2M = "m2m"
internal val TEST_ENCODER = BCryptPasswordEncoder(4)

/** In-memory repository that counts writes, to prove a startup in sync with config writes nothing. */
internal class CountingRegisteredClientRepository : RegisteredClientRepository {
    private val clients = mutableMapOf<String, RegisteredClient>()
    var saves = 0
        private set

    override fun save(registeredClient: RegisteredClient) {
        saves++
        clients[registeredClient.id] = registeredClient
    }

    override fun findById(id: String): RegisteredClient? = clients[id]

    override fun findByClientId(clientId: String): RegisteredClient? = clients.values.find { it.clientId == clientId }
}
