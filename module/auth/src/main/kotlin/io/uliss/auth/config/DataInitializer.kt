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
    @Value($$"${app.clients.authorization-code.callback-url}") private val callbackUrl: String,
    @Value($$"${app.clients.m2m.client-id}") private val m2mClientId: String,
    @Value($$"${app.clients.m2m.client-secret}") private val m2mClientSecret: String
) : ApplicationRunner {

    override fun run(args: ApplicationArguments) {
        saveAuthCodeClientIfNotExists(webClientId, webClientSecret, callbackUrl)
        saveClientCredentialsClientIfNotExists(m2mClientId, m2mClientSecret)
    }

    private fun saveAuthCodeClientIfNotExists(clientId: String, clientSecret: String, callbackUrl: String) {
        if (registeredClientRepository.findByClientId(clientId) != null) return

        val client = RegisteredClient.withId(UUID.randomUUID().toString())
            .clientId(clientId)
            .clientSecret(passwordEncoder.encode(clientSecret)!!)
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
            .redirectUri(callbackUrl)
            .scope(OidcScopes.OPENID)
            .scope(OidcScopes.PROFILE)
            .clientSettings(ClientSettings.builder().requireProofKey(true).build())
            .tokenSettings(
                TokenSettings.builder()
                    .accessTokenTimeToLive(Duration.ofMinutes(15))
                    .refreshTokenTimeToLive(Duration.ofDays(30))
                    .reuseRefreshTokens(false)
                    .build()
            )
            .build()

        registeredClientRepository.save(client)
    }

    private fun saveClientCredentialsClientIfNotExists(clientId: String, clientSecret: String) {
        if (registeredClientRepository.findByClientId(clientId) != null) return

        val client = RegisteredClient.withId(UUID.randomUUID().toString())
            .clientId(clientId)
            .clientSecret(passwordEncoder.encode(clientSecret)!!)
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
            .authorizationGrantType(AuthorizationGrantType.CLIENT_CREDENTIALS)
            .scope("internal")
            .build()

        registeredClientRepository.save(client)
    }
}