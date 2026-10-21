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
        // a right-to-left override, a bidi isolate, a zero-width space, a byte order mark, a newline, private use
        listOf("Bob\u202Eevil", "Bob\u2066x", "Bo\u200Bb", "\uFEFFBob", "Bob\nAdmin", "Bob\uE000").forEach { name ->
            assertFailsWith<BadRequestException>(name) { command.apply(user(), request(name)) }
        }
    }

    @Test
    fun `the joiners that names and emoji need are allowed`() {
        // a Persian name with a zero-width non-joiner, an emoji sequence held together by a zero-width joiner
        listOf("\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645", "Ann \uD83D\uDC69\u200D\uD83D\uDCBB").forEach { name ->
            val user = user()

            command.apply(user, request(name))

            assertEquals(name, user.displayName)
        }
    }

    @Test
    fun `a name of joiners only is rejected`() {
        assertFailsWith<BadRequestException> { command.apply(user(), request("\u200D\u200C")) }
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
