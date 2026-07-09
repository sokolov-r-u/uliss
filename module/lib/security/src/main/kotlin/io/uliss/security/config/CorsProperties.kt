package io.uliss.security.config

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties(prefix = "security.cors")
data class CorsProperties(
    var allowedOrigins: List<String> = emptyList(),
    var allowedMethods: List<String> = listOf("GET", "POST", "PUT", "DELETE"),
    var allowedHeaders: List<String> = listOf("*"),
    var register: String = "/**"
)