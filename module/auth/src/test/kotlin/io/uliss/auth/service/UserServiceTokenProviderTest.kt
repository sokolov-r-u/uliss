package io.uliss.auth.service

import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator
import com.nimbusds.jose.jwk.source.ImmutableJWKSet
import com.nimbusds.jose.proc.SecurityContext
import io.uliss.api.user.v1.UserServiceAuth
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

class UserServiceTokenProviderTest {

    private val rsaKey = RSAKeyGenerator(2048).keyID("test-key").generate()
    private val clock = MutableClock(Instant.parse("2026-10-16T12:00:00Z"))
    private val provider = UserServiceTokenProvider(ImmutableJWKSet<SecurityContext>(JWKSet(rsaKey)), clock, ISSUER)

    // signature only: the token is minted at the mutable clock's time, not now
    private val decoder = NimbusJwtDecoder.withPublicKey(rsaKey.toRSAPublicKey()).build()
        .apply { setJwtValidator { OAuth2TokenValidatorResult.success() } }

    @Test
    fun `token is a short-lived user-service token signed by auth`() {
        val jwt = decoder.decode(provider.getToken())

        assertEquals(ISSUER, jwt.issuer.toString())
        assertEquals("auth-service", jwt.subject)
        assertEquals(listOf(UserServiceAuth.AUDIENCE), jwt.audience)
        assertEquals(UserServiceAuth.USER_INFO_SCOPE, jwt.getClaimAsString("scope"))
        assertEquals(null, jwt.getClaimAsString("userId"))
        assertEquals(clock.instant(), jwt.issuedAt)
        assertEquals(clock.instant().plus(Duration.ofMinutes(5)), jwt.expiresAt)
    }

    @Test
    fun `token is reused while more than a minute is left`() {
        val first = provider.getToken()

        clock.advance(Duration.ofMinutes(3).plusSeconds(59))

        assertEquals(first, provider.getToken())
    }

    @Test
    fun `token is renewed one minute before it expires`() {
        val first = provider.getToken()

        clock.advance(Duration.ofMinutes(4))
        val renewed = provider.getToken()

        assertNotEquals(first, renewed)
        assertEquals(clock.instant().plus(Duration.ofMinutes(5)), decoder.decode(renewed).expiresAt)
    }

    private class MutableClock(private var now: Instant) : Clock() {
        fun advance(duration: Duration) {
            now = now.plus(duration)
        }

        override fun instant(): Instant = now
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
    }

    private companion object {
        const val ISSUER = "http://auth.test"
    }
}
