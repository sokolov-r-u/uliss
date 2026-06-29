package io.uliss.security.config

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@EnableWebSecurity
@Configuration
class SecurityConfig {

    @Bean
    @ConditionalOnMissingBean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .anonymous { it.disable() }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .csrf { it.disable() }
            .cors { }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests { it.anyRequest().authenticated() }
            .oauth2ResourceServer { it.jwt { } }
            .build()


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
