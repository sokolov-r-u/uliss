package io.uliss.database

import io.uliss.database.audit.AuditorAwareImpl
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.data.domain.AuditorAware
import org.springframework.data.jpa.repository.config.EnableJpaAuditing

@AutoConfiguration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
class DatabaseAutoConfiguration {

    // Fallback auditor; a security-aware provider overrides it when :security is present.
    @Bean
    @ConditionalOnMissingBean(AuditorAware::class)
    fun auditorProvider(): AuditorAware<String> = AuditorAwareImpl()
}