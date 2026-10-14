package io.uliss.auth.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.oidc.OidcScopes
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.settings.ClientSettings
import org.springframework.security.oauth2.server.authorization.settings.TokenSettings
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.UUID

@Component
class DataInitializer(
    private val registeredClientRepository: RegisteredClientRepository,
    private val passwordEncoder: PasswordEncoder,
    @Value($$"${app.clients.authorization-code.client-id}") private val webClientId: String,
    @Value($$"${app.clients.authorization-code.client-secret}") private val webClientSecret: String,
    @Value($$"${app.clients.authorization-code.callback-urls}") private val callbackUrls: List<String>,
    @Value($$"${app.clients.m2m.client-id}") private val m2mClientId: String,
    @Value($$"${app.clients.m2m.client-secret}") private val m2mClientSecret: String
) : ApplicationRunner {

    override fun run(args: ApplicationArguments) {
        saveOrUpdateAuthCodeClient(webClientId, webClientSecret, callbackUrls)
        saveOrUpdateClientCredentialsClient(m2mClientId, m2mClientSecret)
    }

    /** Config is the source of truth: an existing client gets the current secret, settings and callback URLs. */
    private fun saveOrUpdateAuthCodeClient(clientId: String, clientSecret: String, callbackUrls: List<String>) {
        val existing = registeredClientRepository.findByClientId(clientId)
        val builder = existing?.let { RegisteredClient.from(it) }
            ?: RegisteredClient.withId(UUID.randomUUID().toString())
                .clientId(clientId)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
                .scope(OidcScopes.OPENID)
                .scope(OidcScopes.PROFILE)

        val client = builder
            .clientSecret(secretHash(existing, clientSecret))
            .redirectUris { uris -> uris.addAll(callbackUrls) }
            .clientSettings(ClientSettings.builder().requireProofKey(true).build())
            .tokenSettings(
                TokenSettings.builder()
                    .accessTokenTimeToLive(Duration.ofMinutes(15))
                    .refreshTokenTimeToLive(Duration.ofDays(30))
                    .reuseRefreshTokens(false)
                    .build()
            )
            .build()

        if (client != existing) registeredClientRepository.save(client)
    }

    private fun saveOrUpdateClientCredentialsClient(clientId: String, clientSecret: String) {
        val existing = registeredClientRepository.findByClientId(clientId)
        val builder = existing?.let { RegisteredClient.from(it) }
            ?: RegisteredClient.withId(UUID.randomUUID().toString())
                .clientId(clientId)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                .scope("internal")

        val client = builder.clientSecret(secretHash(existing, clientSecret)).build()

        if (client != existing) registeredClientRepository.save(client)
    }

    /** Keeps the stored hash when it still matches, so a restart does not rewrite the row. */
    private fun secretHash(existing: RegisteredClient?, rawSecret: String): String {
        val stored = existing?.clientSecret
        if (stored != null && passwordEncoder.matches(rawSecret, stored)) return stored
        return passwordEncoder.encode(rawSecret)
            ?: throw IllegalStateException("password encoder returned no hash for a client secret")
    }
}
