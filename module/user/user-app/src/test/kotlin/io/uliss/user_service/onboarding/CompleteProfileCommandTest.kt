package io.uliss.user_service.onboarding

import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.Gender
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class CompleteProfileCommandTest {

    private val command = CompleteProfileCommand()

    private fun request(birthDate: LocalDate?, gender: Gender?) =
        OnboardingRequest(OnboardingMessageCode.COMPLETE_PROFILE, null, birthDate, gender)

    private fun user() = UserEntity(authId = UUID.randomUUID(), displayName = null)

    @Test
    fun `both fields blank is skipped without mutating the user`() {
        val user = user()

        val status = command.apply(user, request(null, null))

        assertEquals(UserMessageStatus.SKIPPED, status)
        assertNull(user.birthDate)
        assertNull(user.gender)
    }

    @Test
    fun `only birthDate provided completes without touching gender`() {
        val user = user()
        user.gender = Gender.FEMALE

        val status = command.apply(user, request(LocalDate.of(1990, 1, 1), null))

        assertEquals(UserMessageStatus.COMPLETED, status)
        assertEquals(LocalDate.of(1990, 1, 1), user.birthDate)
        assertEquals(Gender.FEMALE, user.gender)
    }

    @Test
    fun `only gender provided completes without touching birthDate`() {
        val user = user()
        user.birthDate = LocalDate.of(1985, 5, 5)

        val status = command.apply(user, request(null, Gender.MALE))

        assertEquals(UserMessageStatus.COMPLETED, status)
        assertEquals(LocalDate.of(1985, 5, 5), user.birthDate)
        assertEquals(Gender.MALE, user.gender)
    }

    @Test
    fun `both fields provided are applied together`() {
        val user = user()

        val status = command.apply(user, request(LocalDate.of(2000, 12, 31), Gender.OTHER))

        assertEquals(UserMessageStatus.COMPLETED, status)
        assertEquals(LocalDate.of(2000, 12, 31), user.birthDate)
        assertEquals(Gender.OTHER, user.gender)
    }
}
