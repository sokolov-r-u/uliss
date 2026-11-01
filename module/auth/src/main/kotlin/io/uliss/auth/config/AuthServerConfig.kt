package io.uliss.auth.config

import io.uliss.auth.repository.AuthorizationSessionRepository
import io.uliss.auth.service.ReuseDetectingAuthorizationService
import io.uliss.auth.service.SessionTrackingAuthorizationService
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationConsentService
import org.springframework.security.oauth2.server.authorization.JdbcOAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationConsentService
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService
import org.springframework.security.oauth2.server.authorization.client.JdbcRegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.client.RegisteredClientRepository
import org.springframework.security.oauth2.server.authorization.settings.AuthorizationServerSettings
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock

@Configuration
class AuthServerConfig(
    @Value($$"${app.auth.issuer}") private val issuer: String
) {

    @Bean
    fun registeredClientRepository(jdbcTemplate: JdbcTemplate): RegisteredClientRepository =
        JdbcRegisteredClientRepository(jdbcTemplate)

    /**
     * Persists codes and tokens so sessions survive restarts and work across replicas; detects refresh reuse and
     * remembers each authorization's browser session for end-session.
     */
    @Bean
    fun authorizationService(
        jdbcTemplate: JdbcTemplate,
        registeredClientRepository: RegisteredClientRepository,
        authorizationSessionRepository: AuthorizationSessionRepository,
        clock: Clock,
        transactionManager: PlatformTransactionManager,
    ): OAuth2AuthorizationService = ReuseDetectingAuthorizationService(
        SessionTrackingAuthorizationService(
            JdbcOAuth2AuthorizationService(jdbcTemplate, registeredClientRepository),
            authorizationSessionRepository,
        ),
        jdbcTemplate,
        clock,
        TransactionTemplate(transactionManager),
    )

    @Bean
    fun authorizationConsentService(
        jdbcTemplate: JdbcTemplate,
        registeredClientRepository: RegisteredClientRepository,
    ): OAuth2AuthorizationConsentService =
        JdbcOAuth2AuthorizationConsentService(jdbcTemplate, registeredClientRepository)

    @Bean
    fun authorizationServerSettings(): AuthorizationServerSettings =
        AuthorizationServerSettings.builder()
            .issuer(issuer)
            .build()
}
