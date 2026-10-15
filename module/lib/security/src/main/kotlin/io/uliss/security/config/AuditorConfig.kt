package io.uliss.security.config

import io.uliss.database.audit.SYSTEM_AUDITOR
import io.uliss.security.utils.USER_ID_CLAIM
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.domain.AuditorAware
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import java.util.Optional

@Configuration
class AuditorConfig {

    /**
     * Auditor = user profile id when a user JWT is present, otherwise SYSTEM. Never empty,
     * so created_by/updated_by always tell whether a user or the system made the change.
     */
    @Bean
    fun auditorProvider(): AuditorAware<String> = AuditorAware {
        val userId = (SecurityContextHolder.getContext().authentication
            ?.takeIf { it.isAuthenticated }
            ?.principal as? Jwt)
            ?.getClaimAsString(USER_ID_CLAIM)
        Optional.of(userId ?: SYSTEM_AUDITOR)
    }
}
