package io.uliss.auth.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings

@Configuration
class AuthServerConfig(
    @Value($$"${app.auth.issuer}") private val issuer: String
) {

    @Bean
    fun registeredClientRepository(jdbcTemplate: JdbcTemplate): RegisteredClientRepository =
        JdbcRegisteredClientRepository(jdbcTemplate)


    @Bean
    fun authorizationServerSettings(): AuthorizationServerSettings =
        AuthorizationServerSettings.builder()
            .issuer(issuer)
            .build()
}