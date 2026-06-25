package io.uliss.auth.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
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
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher

@Configuration
@EnableWebSecurity
class SecurityConfig {
    private val passwordEncoderStrength = 12

    @Bean
    @Order(1)
    fun authorizationServerSecurityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .securityMatcher("/oauth2/**", "/.well-known/**")
        .with(OAuth2AuthorizationServerConfigurer()) { it.oidc { Customizer.withDefaults<OidcConfigurer>() } }
        .authorizeHttpRequests { it.anyRequest().authenticated() }
        .formLogin(Customizer.withDefaults())
        .configureExceptionHandling()
        .build()

    @Bean
    @Order(2)
    fun defaultSecurityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { auth ->
            auth
                .requestMatchers("/login", "/auth/register").permitAll()
                .anyRequest().authenticated()
        }
        .formLogin(Customizer.withDefaults())
        .build()

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder(passwordEncoderStrength)
}

private fun HttpSecurity.configureExceptionHandling() = exceptionHandling { exceptions ->
    exceptions.defaultAuthenticationEntryPointFor(
        LoginUrlAuthenticationEntryPoint("/login"),
        MediaTypeRequestMatcher(MediaType.TEXT_HTML)
    )
}

