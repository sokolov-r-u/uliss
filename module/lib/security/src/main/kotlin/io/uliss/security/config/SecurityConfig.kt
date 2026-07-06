package io.uliss.security.config

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.savedrequest.CookieRequestCache
import org.springframework.security.web.savedrequest.RequestCache
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@EnableWebSecurity
@Configuration
class SecurityConfig {

    @Bean
    @ConditionalOnMissingBean
    fun securityFilterChain(http: HttpSecurity, requestCache: RequestCache): SecurityFilterChain =
        http
            .anonymous { it.disable() }
            .httpBasic { it.disable() }
            .formLogin { it.disable() }
            .csrf { it.disable() }
            .cors { }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests { it.anyRequest().authenticated() }
            .oauth2ResourceServer { it.jwt { } }
            .exceptionHandling { it.authenticationEntryPoint(authenticationEntryPoint(requestCache)) }
            .build()

    @Bean
    fun corsConfigurationSource(props: CorsProperties): CorsConfigurationSource {
        val configuration = CorsConfiguration().apply {
            allowedOrigins = props.allowedOrigins
            allowedMethods = props.allowedMethods
            allowedHeaders = props.allowedHeaders
        }
        return UrlBasedCorsConfigurationSource().apply { registerCorsConfiguration(props.register, configuration) }
    }

    @Bean
//    saves original URI to the cookie
    fun requestCache(): RequestCache = CookieRequestCache()
}

private fun authenticationEntryPoint(requestCache: RequestCache) = AuthenticationEntryPoint { request, response, ex ->
    requestCache.saveRequest(request, response)
    when (ex) {
//        todo double check errorCode
        is InvalidBearerTokenException if (ex.error.errorCode != "invalid_token")
            -> response.sendRedirect("/oauth2/refresh")

        else -> response.sendRedirect("/oauth2/login")
    }
}

