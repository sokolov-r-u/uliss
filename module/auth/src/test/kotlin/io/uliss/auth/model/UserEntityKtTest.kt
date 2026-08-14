package io.uliss.auth.model

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UserEntityKtTest {

    private fun user(status: UserStatus) =
        UserEntity(email = "alice@example.com", passwordHash = "hashed-password", status = status)

    @Test
    fun `username is the entity id, not the email`() {
        val entity = user(UserStatus.ACTIVE)

        assertEquals(entity.id.toString(), entity.toUserDetails().username)
    }

    @Test
    fun `password is passed through unchanged`() {
        val entity = user(UserStatus.ACTIVE)

        assertEquals("hashed-password", entity.toUserDetails().password)
    }

    @Test
    fun `ACTIVE status maps to an unlocked account`() {
        assertTrue(user(UserStatus.ACTIVE).toUserDetails().isAccountNonLocked)
    }

    @Test
    fun `DISABLED status maps to a locked account`() {
        assertFalse(user(UserStatus.DISABLED).toUserDetails().isAccountNonLocked)
    }

    @Test
    fun `PENDING_VERIFICATION status maps to an unlocked account`() {
        assertTrue(user(UserStatus.PENDING_VERIFICATION).toUserDetails().isAccountNonLocked)
    }

    @Test
    fun `every mapped user is enabled regardless of status`() {
        // Nothing in toUserDetails() derives `enabled` from `status` - PENDING_VERIFICATION
        // users are enabled just like ACTIVE ones. Locking this in explicitly since it is easy
        // to assume PENDING_VERIFICATION should also disable the account.
        assertTrue(user(UserStatus.ACTIVE).toUserDetails().isEnabled)
        assertTrue(user(UserStatus.PENDING_VERIFICATION).toUserDetails().isEnabled)
        assertTrue(user(UserStatus.DISABLED).toUserDetails().isEnabled)
    }

    @Test
    fun `role is always USER`() {
        val authorities = user(UserStatus.ACTIVE).toUserDetails().authorities.map { it.authority }

        assertEquals(listOf("ROLE_${UserRole.USER}"), authorities)
    }
}
