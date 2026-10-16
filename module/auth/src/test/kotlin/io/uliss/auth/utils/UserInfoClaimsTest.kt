package io.uliss.auth.utils

import io.uliss.api.user.v1.UserInfoResponse
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import kotlin.test.Test
import kotlin.test.assertEquals

class UserInfoClaimsTest {

    private fun claimsFor(info: UserInfoResponse): Map<String, Any> =
        JwtClaimsSet.builder().subject("auth-id").apply { addUserInfo(info) }.build().claims - "sub"

    @Test
    fun `onboarded user gets user id and display name only`() {
        val info = UserInfoResponse.newBuilder().setUserId("user-id").setDisplayName("Ann").build()

        assertEquals(mapOf("userId" to "user-id", "displayName" to "Ann"), claimsFor(info))
    }

    @Test
    fun `user with blocking onboarding pending is marked`() {
        val info = UserInfoResponse.newBuilder().setUserId("user-id").setOnboardingRequired(true).build()

        assertEquals(mapOf("userId" to "user-id", "onboardingRequired" to true), claimsFor(info))
    }
}
