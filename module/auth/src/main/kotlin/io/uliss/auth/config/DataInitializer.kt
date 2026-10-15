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

    /**
     * Config is the source of truth: an existing client is rebuilt from config, keeping only its id and issue time
     * (stored authorizations reference the id). Anything added to the row by hand or by an older initializer -
     * grant types, scopes, auth methods, redirect or logout URIs, settings - is dropped.
     */
    private fun saveOrUpdateAuthCodeClient(clientId: String, clientSecret: String, callbackUrls: List<String>) {
        saveIfChanged(clientId) { existing ->
            configuredClient(existing, clientId, clientSecret)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
                .scope(OidcScopes.OPENID)
                .scope(OidcScopes.PROFILE)
                .redirectUris { it.addAll(callbackUrls) }
                .clientSettings(ClientSettings.builder().requireProofKey(true).build())
                .tokenSettings(
                    TokenSettings.builder()
                        .accessTokenTimeToLive(Duration.ofMinutes(15))
                        .refreshTokenTimeToLive(Duration.ofDays(30))
                        .reuseRefreshTokens(false)
                        .build()
                )
        }
    }

    private fun saveOrUpdateClientCredentialsClient(clientId: String, clientSecret: String) {
        saveIfChanged(clientId) { existing ->
            configuredClient(existing, clientId, clientSecret)
                .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
                .scope("internal")
        }
    }

    private fun saveIfChanged(clientId: String, configured: (RegisteredClient?) -> RegisteredClient.Builder) {
        val existing = registeredClientRepository.findByClientId(clientId)
        val client = configured(existing).build()
        if (client != existing) registeredClientRepository.save(client)
    }

    private fun configuredClient(existing: RegisteredClient?, clientId: String, clientSecret: String) =
        RegisteredClient.withId(existing?.id ?: UUID.randomUUID().toString())
            .clientId(clientId)
            .apply { existing?.clientIdIssuedAt?.let(::clientIdIssuedAt) }
            .clientSecret(secretHash(existing, clientSecret))
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)

    /**
     * Keeps the stored hash when it still matches and its encoding is current, so a restart does not rewrite the row;
     * a hash made with a weaker encoding (e.g. lower BCrypt strength) is replaced.
     */
    private fun secretHash(existing: RegisteredClient?, rawSecret: String): String {
        val stored = existing?.clientSecret
        if (stored != null && passwordEncoder.matches(rawSecret, stored) && !passwordEncoder.upgradeEncoding(stored)) {
            return stored
        }
        return passwordEncoder.encode(rawSecret)
            ?: throw IllegalStateException("password encoder returned no hash for a client secret")
    }
}
