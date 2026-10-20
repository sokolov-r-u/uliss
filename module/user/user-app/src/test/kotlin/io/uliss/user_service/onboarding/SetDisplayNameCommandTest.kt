package io.uliss.user_service.onboarding

import io.uliss.exception.common.BadRequestException
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SetDisplayNameCommandTest {

    private val command = SetDisplayNameCommand()

    private fun request(displayName: String?) =
        OnboardingInput(displayName = displayName, birthDate = null, gender = null)

    private fun user() = UserEntity(authId = UUID.randomUUID(), displayName = null)

    @Test
    fun `null displayName is rejected as required`() {
        assertFailsWith<BadRequestException> { command.apply(user(), request(null)) }
    }

    @Test
    fun `empty displayName is rejected as required`() {
        assertFailsWith<BadRequestException> { command.apply(user(), request("")) }
    }

    @Test
    fun `whitespace-only displayName is rejected as required`() {
        assertFailsWith<BadRequestException> { command.apply(user(), request("   ")) }
    }

    @Test
    fun `control and invisible characters are rejected`() {
        // a right-to-left override, a zero-width space, a newline
        listOf("Bob\u202Eevil", "Bo\u200Bb", "Bob\nAdmin").forEach { name ->
            assertFailsWith<BadRequestException>(name) { command.apply(user(), request(name)) }
        }
    }

    @Test
    fun `the name is stored in NFC so equal-looking names are equal`() {
        val user = user()

        command.apply(user, request("Zoe\u0308")) // e + combining diaeresis

        assertEquals("Zo\u00EB", user.displayName)
    }

    @Test
    fun `letters of any script are allowed`() {
        val user = user()

        command.apply(user, request("Анна Мария"))

        assertEquals("Анна Мария", user.displayName)
    }

    @Test
    fun `valid displayName is trimmed and applied`() {
        val user = user()

        val status = command.apply(user, request("  Bob  "))

        assertEquals("Bob", user.displayName)
        assertEquals(UserMessageStatus.COMPLETED, status)
    }
}
