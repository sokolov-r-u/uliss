package io.uliss.auth.config

import io.uliss.auth.handler.BrowserSessionLogoutHandler
import io.uliss.auth.handler.TokenErrorResponseHandler
import io.uliss.auth.service.BrowserSessionLogoutService
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
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.oauth2.server.authorization.oidc.web.authentication.OidcLogoutAuthenticationSuccessHandler
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.LoginUrlAuthenticationEntryPoint
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler
import org.springframework.security.web.util.matcher.MediaTypeRequestMatcher
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
@EnableWebSecurity
class SecurityConfig(
    @param:Value($$"${app.cors.allowed-origins}") private val allowedOrigins: List<String>,
    @param:Value($$"${app.frontend-url}") private val frontendUrl: String,
) {
    private val passwordEncoderStrength = 12

    @Bean
    @Order(1)
    fun authorizationServerSecurityFilterChain(
        http: HttpSecurity,
        browserSessionLogoutService: BrowserSessionLogoutService,
    ): SecurityFilterChain {
        // every endpoint the server advertises, incl. OIDC /userinfo and /connect/logout, not only /oauth2/**
        val authorizationServer = OAuth2AuthorizationServerConfigurer()
        return http
            .securityMatcher(authorizationServer.endpointsMatcher)
            .with(authorizationServer) { server ->
                server.oidc { oidc ->
                    // end-session also revokes the other tabs' authorizations of this browser session
                    val logoutResponse = OidcLogoutAuthenticationSuccessHandler()
                    logoutResponse.setLogoutHandler(BrowserSessionLogoutHandler(browserSessionLogoutService))
                    oidc.logoutEndpoint { it.logoutResponseHandler(logoutResponse) }
                }
                server.tokenEndpoint { it.errorResponseHandler(TokenErrorResponseHandler()) }
            }
            .authorizeHttpRequests { it.anyRequest().authenticated() }
            // /userinfo authenticates with the access token
            .oauth2ResourceServer { it.jwt(Customizer.withDefaults()) }
            .cors(Customizer.withDefaults())
            .formLogin(Customizer.withDefaults())
            .configureExceptionHandling()
            .build()
    }

    @Bean
    @Order(2)
    fun defaultSecurityFilterChain(http: HttpSecurity): SecurityFilterChain = http
        .authorizeHttpRequests { auth ->
            auth
                .requestMatchers("/login", "/register", "/ds/**", "/error", "/actuator/health").permitAll()
                .anyRequest().authenticated()
        }
        .formLogin {
            // a login without a saved authorize request (the form opened directly or restored) has nowhere to
            // return in this server; the web app starts its own login, which passes on this session
            it.loginPage("/login").defaultSuccessUrl(frontendUrl, false)
        }
        .csrf { csrf ->
            // Xor masks the token per response (BREACH); a null attribute name keeps the eager loading
            val requestHandler = XorCsrfTokenRequestAttributeHandler()
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

