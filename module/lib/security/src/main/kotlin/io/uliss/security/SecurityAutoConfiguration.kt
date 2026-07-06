package io.uliss.security

import io.uliss.security.config.CorsProperties
import io.uliss.security.config.SecurityConfig
import io.uliss.security.config.SecurityProperties
import io.uliss.security.controller.AuthController
import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Import
import org.springframework.resilience.annotation.EnableResilientMethods
import service.AuthService

@AutoConfiguration
@EnableResilientMethods
@Import(
    SecurityConfig::class,
    CorsProperties::class,
    AuthController::class,
    AuthService::class,
    SecurityProperties::class
)
class SecurityAutoConfiguration