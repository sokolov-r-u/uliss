package io.uliss.security

import io.uliss.security.config.CorsConfig
import io.uliss.security.config.SecurityConfig
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Import

@AutoConfiguration
@Import(SecurityConfig::class, CorsConfig::class)
class SecurityAutoConfiguration