package io.uliss.user_service.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.grpc.server.GlobalServerInterceptor
import org.springframework.grpc.server.security.AuthenticationProcessInterceptor
import org.springframework.grpc.server.security.GrpcSecurity

/**
 * gRPC server security. With Spring Security on the classpath (via :security) the gRPC
 * resource-server auto-config would require a Bearer JWT on every call. Defining our own
 * AuthenticationProcessInterceptor makes that auto-config back off (@ConditionalOnMissingBean).
 *
 * gRPC here is cluster-internal only (not exposed via ingress) and the auth server calls it
 * without a token during token enrichment, so we permit all gRPC calls. HTTP security (the
 * :security resource server) is unaffected. Revisit with mTLS / m2m tokens if gRPC is exposed.
 */
@Configuration(proxyBeanMethods = false)
class GrpcSecurityConfig {

    @Bean
    @GlobalServerInterceptor
    fun permitAllGrpcSecurity(grpcSecurity: GrpcSecurity): AuthenticationProcessInterceptor {
        grpcSecurity.authorizeRequests { it.allRequests().permitAll() }
        return grpcSecurity.build()
    }
}
