package io.uliss.security

import io.uliss.security.config.AuditorConfig
import io.uliss.security.config.CorsProperties
import io.uliss.security.config.SecurityConfig
import io.uliss.security.config.SecurityProperties
import io.uliss.security.controller.AuthController
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.autoconfigure.AutoConfigureBefore
import org.springframework.context.annotation.Import
import org.springframework.resilience.annotation.EnableResilientMethods
import service.AuthService

@AutoConfiguration
@AutoConfigureBefore(name = ["io.uliss.database.DatabaseAutoConfiguration"])
@EnableResilientMethods
@Import(
    SecurityConfig::class,
    CorsProperties::class,
    AuditorConfig::class,
    AuthController::class,
    AuthService::class,
    SecurityProperties::class
)
class SecurityAutoConfiguration