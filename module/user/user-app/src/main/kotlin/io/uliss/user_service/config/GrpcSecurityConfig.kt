package io.uliss.user_service.config

import io.uliss.api.user.v1.UserServiceAuth
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.grpc.server.GlobalServerInterceptor
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.grpc.server.security.AuthenticationProcessInterceptor
import org.springframework.grpc.server.security.GrpcSecurity
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator
import org.springframework.security.oauth2.jwt.JwtClaimNames
import org.springframework.security.oauth2.jwt.JwtClaimValidator
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtValidators
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.web.client.RestTemplate
import java.time.Duration

/**
 * gRPC accepts only the service token auth signs for user-service (`aud`, `sub`, `scope` from [UserServiceAuth]).
 * The decoder is local, not a bean: the HTTP resource server keeps Boot's decoder, which requires `userId`,
 * so a service token is useless over REST and a user token is useless over gRPC.
 */
@Configuration(proxyBeanMethods = false)
class GrpcSecurityConfig(
    @Value($$"${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}") private val jwkSetUri: String,
    @Value($$"${spring.security.oauth2.resourceserver.jwt.issuer-uri}") private val issuer: String,
) {

    @Bean
    @GlobalServerInterceptor
    fun grpcServiceTokenSecurity(grpcSecurity: GrpcSecurity): AuthenticationProcessInterceptor {
        grpcSecurity
            .authorizeRequests { it.allRequests().hasAuthority("SCOPE_${UserServiceAuth.USER_INFO_SCOPE}") }
            .oauth2ResourceServer { it.jwt { jwt -> jwt.decoder(serviceTokenDecoder()) } }
        return grpcSecurity.build()
    }

    private fun serviceTokenDecoder(): JwtDecoder =
        NimbusJwtDecoder.withJwkSetUri(jwkSetUri).restOperations(jwksClient()).build().apply {
            setJwtValidator(
                DelegatingOAuth2TokenValidator(
                    JwtValidators.createDefaultWithIssuer(issuer),
                    // the claim is null when absent
                    JwtClaimValidator<Any>(JwtClaimNames.AUD) { aud -> aud is Collection<*> && UserServiceAuth.AUDIENCE in aud },
                    JwtClaimValidator<String>(JwtClaimNames.SUB) { it == UserServiceAuth.SUBJECT },
                )
            )
        }

    // the default RestTemplate has no timeouts: a hung auth would hold gRPC threads forever
    private fun jwksClient() = RestTemplate(SimpleClientHttpRequestFactory().apply {
        setConnectTimeout(JWKS_TIMEOUT)
        setReadTimeout(JWKS_TIMEOUT)
    })

    private companion object {
        val JWKS_TIMEOUT: Duration = Duration.ofSeconds(2)
    }
}
