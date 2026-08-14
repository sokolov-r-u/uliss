package io.uliss.user_service.onboarding

import io.uliss.exception.common.BadRequestException
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SetDisplayNameCommandTest {

    private val command = SetDisplayNameCommand()

    private fun request(displayName: String?) =
        OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, displayName, null, null)

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
    fun `valid displayName is trimmed and applied`() {
        val user = user()

        val status = command.apply(user, request("  Bob  "))

        assertEquals("Bob", user.displayName)
        assertEquals(UserMessageStatus.COMPLETED, status)
    }
}
