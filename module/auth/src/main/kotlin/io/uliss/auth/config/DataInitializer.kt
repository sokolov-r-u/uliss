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
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class DataInitializer(
    private val registeredClientRepository: RegisteredClientRepository,
    private val passwordEncoder: PasswordEncoder,
    @Value($$"${app.clients.spa.client-id}") private val spaClient: String,
    @Value($$"${app.clients.spa.redirect-uri}") private val spaRedirectUri: String,
    @Value($$"${app.clients.m2m.client-id}") private val m2mClient: String,
    @Value($$"${app.clients.m2m.client-secret}") private val m2mSecret: String
) : ApplicationRunner {

    override fun run(args: ApplicationArguments) {
        saveSpaClientIfNotExists(spaClient, spaRedirectUri)
        saveM2mClientIfNotExists(m2mClient, m2mSecret)
    }

    private fun saveSpaClientIfNotExists(clientId: String, redirectUri: String) {
        if (registeredClientRepository.findByClientId(clientId) != null) return

        val client = RegisteredClient.withId(UUID.randomUUID().toString())
            .clientId(clientId)
            .clientAuthenticationMethod(ClientAuthenticationMethod.NONE)
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .authorizationGrantType(AuthorizationGrantType.REFRESH_TOKEN)
            .redirectUri(redirectUri)
            .scope(OidcScopes.OPENID)
            .scope(OidcScopes.PROFILE)
            .clientSettings(ClientSettings.builder().requireProofKey(true).build())
            .build()

        registeredClientRepository.save(client)
    }

    private fun saveM2mClientIfNotExists(clientId: String, clientSecret: String) {
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