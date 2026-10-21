package io.uliss.auth.service

import io.uliss.auth.model.UserEntity
import io.uliss.auth.model.UserStatus
import io.uliss.auth.repository.UserRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.security.oauth2.core.AuthorizationGrantType
import org.springframework.security.oauth2.core.ClientAuthenticationMethod
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2ErrorCodes
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationCode
import org.springframework.security.oauth2.server.authorization.client.RegisteredClient
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RefreshGrantPolicyTest {

    private val userRepository = Mockito.mock(UserRepository::class.java)
    private val signedInAt = Instant.parse("2026-01-01T10:00:00Z")
    private val userId = UUID.randomUUID()

    @Test
    fun `an active user within the session lifetime may refresh`() {
        givenUser(UserStatus.ACTIVE)

        policyAt(signedInAt.plus(Duration.ofDays(89))).checkRefresh(authorization())
    }

    @Test
    fun `a user still verifying the email may refresh`() {
        givenUser(UserStatus.PENDING_VERIFICATION)

        policyAt(signedInAt.plusSeconds(60)).checkRefresh(authorization())
    }

    @Test
    fun `a refresh after the absolute session lifetime is rejected`() {
        givenUser(UserStatus.ACTIVE)

        assertRejected { policyAt(signedInAt.plus(Duration.ofDays(90)).plusSeconds(1)).checkRefresh(authorization()) }
    }

    @Test
    fun `a disabled user may not refresh`() {
        givenUser(UserStatus.DISABLED)

        assertRejected { policyAt(signedInAt.plusSeconds(60)).checkRefresh(authorization()) }
    }

    @Test
    fun `a refresh for a user that no longer exists is rejected`() {
        Mockito.`when`(userRepository.findById(userId)).thenReturn(Optional.empty())

        assertRejected { policyAt(signedInAt.plusSeconds(60)).checkRefresh(authorization()) }
    }

    @Test
    fun `a principal that is not a user id is rejected`() {
        assertRejected { policyAt(signedInAt).checkRefresh(authorization(principal = "alice@example.com")) }
    }

    private fun givenUser(status: UserStatus) {
        val user = UserEntity(email = "a@example.com", passwordHash = "hash", status = status)
        Mockito.`when`(userRepository.findById(userId)).thenReturn(Optional.of(user))
    }

    private fun policyAt(now: Instant) = RefreshGrantPolicy(userRepository, Clock.fixed(now, ZoneOffset.UTC))

    private fun authorization(principal: String = userId.toString()): OAuth2Authorization =
        OAuth2Authorization.withRegisteredClient(CLIENT)
            .principalName(principal)
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .token(OAuth2AuthorizationCode("code", signedInAt, signedInAt.plusSeconds(300)))
            .build()

    private fun assertRejected(block: () -> Unit) {
        val ex = assertFailsWith<OAuth2AuthenticationException> { block() }
        assertEquals(OAuth2ErrorCodes.INVALID_GRANT, ex.error.errorCode)
    }

    private companion object {
        val CLIENT: RegisteredClient = RegisteredClient.withId("client-id")
            .clientId("web")
            .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("http://localhost/callback")
            .build()
    }
}
