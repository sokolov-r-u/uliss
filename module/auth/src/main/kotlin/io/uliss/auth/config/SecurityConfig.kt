package io.uliss.auth.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.security.config.Customizer
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.annotation.web.configurers.oauth2.server.authorization.OAuth2AuthorizationServerConfigurer
import org.springframework.security.config.annotation.web.configurers.oauth2.server.authorization.OidcConfigurer
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
@EnableWebSecurity
class SecurityConfig(
    @param:Value($$"${app.cors.allowed-origins}") private val allowedOrigins: List<String>
) {
    private val passwordEncoderStrength = 12

    @Bean
    @Order(1)
    fun authorizationServerSecurityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .securityMatcher("/oauth2/**", "/.well-known/**")
        .with(OAuth2AuthorizationServerConfigurer()) { it.oidc { Customizer.withDefaults<OidcConfigurer>() } }
        .authorizeHttpRequests { it.anyRequest().authenticated() }
        .cors(Customizer.withDefaults())
        .formLogin(Customizer.withDefaults())
        .configureExceptionHandling()
        .build()

    @Bean
    @Order(2)
    fun defaultSecurityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { auth ->
            auth
                .requestMatchers("/login", "/register", "/ds/**", "/error").permitAll()
                .anyRequest().authenticated()
        }
        .formLogin { it.loginPage("/login") }
        .csrf { csrf ->
            val requestHandler = CsrfTokenRequestAttributeHandler()
            requestHandler.setCsrfRequestAttributeName(null)
            csrf.csrfTokenRequestHandler(requestHandler)
        }
        .build()

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder(passwordEncoderStrength)

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val config = CorsConfiguration().apply {
            allowedOrigins = this@SecurityConfig.allowedOrigins
            allowedMethods = listOf(HttpMethod.GET.name(), HttpMethod.POST.name(), HttpMethod.OPTIONS.name())
            allowedHeaders = listOf("Authorization", "Content-Type")
            allowCredentials = false
        }
        return UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/oauth2/**", config)
            registerCorsConfiguration("/.well-known/**", config)
        }
    }
}

private fun HttpSecurity.configureExceptionHandling() = exceptionHandling { exceptions ->
    exceptions.defaultAuthenticationEntryPointFor(
        LoginUrlAuthenticationEntryPoint("/login"),
        MediaTypeRequestMatcher(MediaType.TEXT_HTML)
    )
}

