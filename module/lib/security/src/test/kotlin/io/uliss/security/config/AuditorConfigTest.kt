package io.uliss.security.config

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.TestingAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals

class AuditorConfigTest {

    private val auditorProvider = AuditorConfig().auditorProvider()

    @AfterEach
    fun clearContext() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `returns userId claim when a user JWT is authenticated`() {
        val userId = UUID.randomUUID().toString()
        SecurityContextHolder.getContext().authentication = TestingAuthenticationToken(userJwt(userId), null, "USER")

        assertEquals(userId, auditorProvider.currentAuditor.orElseThrow())
    }

    @Test
    fun `falls back to SYSTEM when no one is authenticated`() {
        assertEquals(SYSTEM_AUDITOR, auditorProvider.currentAuditor.orElseThrow())
    }

    private fun userJwt(userId: String): Jwt =
        Jwt.withTokenValue("token")
            .header("alg", "none")
            .claim("userId", userId)
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(60))
            .build()
}
