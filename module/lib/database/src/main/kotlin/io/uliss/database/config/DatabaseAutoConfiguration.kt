package io.uliss.database.config

import io.uliss.database.audit.AuditorAwareImpl
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.data.domain.AuditorAware
import org.springframework.data.jpa.repository.config.EnableJpaAuditing

@AutoConfiguration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
class DatabaseAutoConfiguration {

    @Bean
    fun auditorProvider(): AuditorAware<String> = AuditorAwareImpl()
}