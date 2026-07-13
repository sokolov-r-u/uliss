package io.uliss.auth.config

import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import com.nimbusds.jose.jwk.source.JWKSource
import com.nimbusds.jose.proc.SecurityContext
import io.grpc.StatusRuntimeException
import io.uliss.api.user.v1.DisplayNameRequest
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.model.toKeyPair
import io.uliss.auth.service.SigningKeysService
import io.uliss.logging.logger.AppLogger
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.server.authorization.OAuth2TokenType
import org.springframework.security.oauth2.server.authorization.token.JwtEncodingContext
import org.springframework.security.oauth2.server.authorization.token.OAuth2TokenCustomizer
import java.security.interfaces.RSAPrivateKey
import java.security.interfaces.RSAPublicKey

@Configuration
class TokenConfig {
    private val logger = AppLogger.of(TokenConfig::class)

    @Bean
    fun tokenCustomizer(userChanel: UserServiceGrpc.UserServiceBlockingStub): OAuth2TokenCustomizer<JwtEncodingContext> =
        OAuth2TokenCustomizer { context ->
            if (context.tokenType == OAuth2TokenType.ACCESS_TOKEN) {
                val principal = context.getPrincipal<Authentication>() ?: return@OAuth2TokenCustomizer
                context.claims.claim("roles", principal.authorities.map { it.authority })

                try {
                    val displayNameRequest = DisplayNameRequest.newBuilder().setAuthId(principal.name).build()
                    val displayNameResponse = userChanel.getDisplayName(displayNameRequest)
                    context.claims.claim("displayName", displayNameResponse.displayName)
                } catch (ex: StatusRuntimeException) {
                    logger.warn("user service returns an error. proceed with login", "tokenCustomizer", ex)
                }
            }
        }

    @Bean
    fun jwkSource(signingKeysService: SigningKeysService): JWKSource<SecurityContext> {
        val signingKeyEntity = signingKeysService.getOrGenerate()
        val keyPair = signingKeyEntity.toKeyPair()

        val rsaKey = RSAKey.Builder(keyPair.public as RSAPublicKey)
            .privateKey(keyPair.private as RSAPrivateKey)
            .keyID(signingKeyEntity.id.toString())
            .build()

        return ImmutableJWKSet(JWKSet(rsaKey))
    }

    @Bean
    fun jwtDecoder(jwkSource: JWKSource<SecurityContext>): JwtDecoder =
        OAuth2AuthorizationServerConfiguration.jwtDecoder(jwkSource)

}