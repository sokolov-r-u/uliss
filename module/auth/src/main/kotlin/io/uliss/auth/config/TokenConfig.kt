package io.uliss.auth.config

import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import com.nimbusds.jose.jwk.source.JWKSource
import com.nimbusds.jose.proc.SecurityContext
import io.grpc.StatusRuntimeException
import io.uliss.api.user.v1.UserInfoRequest
import io.uliss.api.user.v1.UserServiceGrpc
import io.uliss.auth.model.toKeyPair
import io.uliss.auth.service.RefreshGrantPolicy
import io.uliss.auth.service.SigningKeysService
import io.uliss.auth.utils.addUserInfo
import io.uliss.logging.logger.AppLogger
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.configuration.OAuth2AuthorizationServerConfiguration
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.AuthorizationGrantType
import io.uliss.auth.exception.UserServiceUnavailableException
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
    fun tokenCustomizer(
        userChanel: UserServiceGrpc.UserServiceBlockingStub,
        refreshGrantPolicy: RefreshGrantPolicy,
    ): OAuth2TokenCustomizer<JwtEncodingContext> =
        OAuth2TokenCustomizer { context ->
            if (context.tokenType == OAuth2TokenType.ACCESS_TOKEN) {
                val principal = context.getPrincipal<Authentication>() ?: return@OAuth2TokenCustomizer
                context.claims.claim("roles", principal.authorities.map { it.authority })

                // client_credentials (m2m) tokens have no user to enrich
                if (context.authorizationGrantType == AuthorizationGrantType.CLIENT_CREDENTIALS) {
                    return@OAuth2TokenCustomizer
                }
                if (context.authorizationGrantType == AuthorizationGrantType.REFRESH_TOKEN) {
                    refreshGrantPolicy.checkRefresh(context.getAuthorization() ?: return@OAuth2TokenCustomizer)
                }

                try {
                    // principal.name is the auth user id (see UserEntity.toUserDetails)
                    val userInfoRequest = UserInfoRequest.newBuilder().setAuthId(principal.name).build()
                    context.claims.addUserInfo(userChanel.getUserInfo(userInfoRequest))
                } catch (ex: StatusRuntimeException) {
                    logger.error("user service unavailable, blocking token issue", "tokenCustomizer", ex)
                    throw UserServiceUnavailableException(ex)
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