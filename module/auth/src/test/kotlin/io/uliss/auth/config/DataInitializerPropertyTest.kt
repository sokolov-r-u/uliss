package io.uliss.auth.config

import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Combinators
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import org.springframework.boot.DefaultApplicationArguments
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings
import java.time.Duration
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Whatever state a stored client is in, startup brings it exactly to config, and a second startup changes nothing. */
class DataInitializerPropertyTest {

    @Property(tries = 50)
    fun `any stored web client ends up exactly as configured and stays so`(@ForAll("storedClients") stored: StoredClient) {
        assertSyncedAndStable(stored.toRegisteredClient(WEB)) { client ->
            assertEquals(
                setOf(AuthorizationGrantType.AUTHORIZATION_CODE, AuthorizationGrantType.REFRESH_TOKEN),
                client.authorizationGrantTypes,
            )
            assertEquals(setOf("openid", "profile"), client.scopes)
            assertEquals(CALLBACKS.toSet(), client.redirectUris)
            assertEquals(setOf("http://new/signed-out"), client.postLogoutRedirectUris)
            assertTrue(client.clientSettings.isRequireProofKey)
            assertEquals(Duration.ofMinutes(15), client.tokenSettings.accessTokenTimeToLive)
            assertEquals(Duration.ofDays(30), client.tokenSettings.refreshTokenTimeToLive)
        }
    }

    private fun assertSyncedAndStable(stored: RegisteredClient, expectConfigured: (RegisteredClient) -> Unit) {
        val repository = CountingRegisteredClientRepository()
        repository.save(stored)

        initializer(repository).run(DefaultApplicationArguments())
        val synced = assertNotNull(repository.findByClientId(stored.clientId))
        val savesAfterSync = repository.saves
        initializer(repository).run(DefaultApplicationArguments())

        expectConfigured(synced)
        assertEquals(stored.id, synced.id)
        assertEquals(setOf(ClientAuthenticationMethod.CLIENT_SECRET_BASIC), synced.clientAuthenticationMethods)
        assertTrue(TEST_ENCODER.matches("web-secret", synced.clientSecret))
        assertEquals(savesAfterSync, repository.saves, "a startup in sync with config must not write")
        assertEquals(synced, repository.findByClientId(stored.clientId))
    }

    @Provide
    fun storedClients(): Arbitrary<StoredClient> = Combinators.combine(
        Arbitraries.of(*GRANTS).set().ofMinSize(1),
        Arbitraries.of("openid", "profile", "internal", "admin").set(),
        Arbitraries.of(*AUTH_METHODS).set().ofMinSize(1),
        // a stored client always has a redirect URI: Spring refuses to build an authorization-code client without one
        Arbitraries.of("http://new/callback", "http://old/callback", "http://evil/callback").set().ofMinSize(1),
        Arbitraries.of("http://old/logout").set(),
        Arbitraries.of(true, false),
        Arbitraries.of("web-secret", "old-secret"),
        Arbitraries.integers().between(1, 120),
    ).`as` { grants, scopes, methods, redirects, logouts, proofKey, secret, ttlMinutes ->
        StoredClient(grants, scopes, methods, redirects, logouts, proofKey, secret, ttlMinutes)
    }

    data class StoredClient(
        val grants: Set<AuthorizationGrantType>,
        val scopes: Set<String>,
        val methods: Set<ClientAuthenticationMethod>,
        val redirects: Set<String>,
        val logouts: Set<String>,
        val requireProofKey: Boolean,
        val secret: String,
        val accessTtlMinutes: Int,
    ) {
        fun toRegisteredClient(clientId: String): RegisteredClient =
            RegisteredClient.withId(UUID.randomUUID().toString())
                .clientId(clientId)
                .clientSecret(requireNotNull(TEST_ENCODER.encode(secret)))
                .clientAuthenticationMethods { it.addAll(methods) }
                .authorizationGrantTypes { it.addAll(grants) }
                .scopes { it.addAll(scopes) }
                .redirectUris { it.addAll(redirects) }
                .postLogoutRedirectUris { it.addAll(logouts) }
                .clientSettings(ClientSettings.builder().requireProofKey(requireProofKey).build())
                .tokenSettings(
                    TokenSettings.builder().accessTokenTimeToLive(Duration.ofMinutes(accessTtlMinutes.toLong())).build()
                )
                .build()
    }

    private fun initializer(repository: CountingRegisteredClientRepository) = DataInitializer(
        registeredClientRepository = repository,
        passwordEncoder = TEST_ENCODER,
        webClientId = WEB,
        webClientSecret = "web-secret",
        callbackUrls = CALLBACKS,
        postLogoutUrls = listOf("http://new/signed-out"),
        retiredClientRepository = NO_RETIRED_CLIENTS,
    )

    private companion object {
        val CALLBACKS = listOf("http://new/callback", "http://other/callback")
        val GRANTS = arrayOf(
            AuthorizationGrantType.AUTHORIZATION_CODE,
            AuthorizationGrantType.REFRESH_TOKEN,
            AuthorizationGrantType.CLIENT_CREDENTIALS,
            AuthorizationGrantType.DEVICE_CODE,
        )
        val AUTH_METHODS = arrayOf(
            ClientAuthenticationMethod.CLIENT_SECRET_BASIC,
            ClientAuthenticationMethod.CLIENT_SECRET_POST,
            ClientAuthenticationMethod.NONE,
        )
    }
}
