package io.uliss.auth.service

import com.nimbusds.jose.jwk.source.JWKSource
import com.nimbusds.jose.proc.SecurityContext
import io.uliss.api.user.v1.UserServiceAuth
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.util.UUID

/**
 * Signs the service token for gRPC calls to user-service with auth's own key, without a request to its own token
 * endpoint (the calls happen while another token is being issued). A `@Component`, not a `@Service`: `LoggingAspect`
 * would print the token in DEBUG traces.
 */
@Component
class UserServiceTokenProvider(
    jwkSource: JWKSource<SecurityContext>,
    private val clock: Clock,
    @Value($$"${app.auth.issuer}") private val issuer: String,
) {
    private val encoder = NimbusJwtEncoder(jwkSource)

    @Volatile
    private var cached: Jwt? = null

    /** Reuses the current token until a minute before it expires. */
    fun getToken(): String {
        cached?.takeIf(::isFresh)?.let { return it.tokenValue }
        return synchronized(this) {
            cached?.takeIf(::isFresh) ?: issue().also { cached = it }
        }.tokenValue
    }

    private fun isFresh(token: Jwt): Boolean =
        token.expiresAt?.let { clock.instant().isBefore(it.minus(RENEW_BEFORE)) } ?: false

    private fun issue(): Jwt {
        val now = clock.instant()
        val claims = JwtClaimsSet.builder()
            .issuer(issuer)
            .subject(SUBJECT)
            .audience(listOf(UserServiceAuth.AUDIENCE))
            .claim("scope", UserServiceAuth.USER_INFO_SCOPE)
            .id(UUID.randomUUID().toString())
            .issuedAt(now)
            .expiresAt(now.plus(TTL))
            .build()
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).build(), claims))
    }

    private companion object {
        const val SUBJECT = "auth-service"
        val TTL: Duration = Duration.ofMinutes(5)
        val RENEW_BEFORE: Duration = Duration.ofMinutes(1)
    }
}
