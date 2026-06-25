package io.uliss.security.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@ConfigurationProperties(prefix = "security.cors")
class CorsConfig(
    val allowedOrigins: List<String> = emptyList(),
    val allowedMethods: List<String> = listOf("GET", "POST", "PUT", "DELETE"),
    val allowedHeaders: List<String> = listOf("*"),
    val register: String = "/**"
) {

    @Bean
    fun corsConfigurationSource(props: CorsConfig): CorsConfigurationSource {
        val configuration = CorsConfiguration().apply {
            allowedOrigins = props.allowedOrigins
            allowedMethods = props.allowedMethods
            allowedHeaders = props.allowedHeaders
        }
        return UrlBasedCorsConfigurationSource().apply { registerCorsConfiguration(props.register, configuration) }
    }
}