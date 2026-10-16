package io.uliss.user_service.service

import io.uliss.user_service.config.TestContainersConfiguration
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import java.util.UUID
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
class OnboardingRequiredTest @Autowired constructor(
    private val userProfileService: UserProfileService,
    private val messageService: MessageService,
) {

    @Test
    fun `a new profile has blocking onboarding pending`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())

        assertTrue(messageService.isOnboardingRequired(user.id))
    }

    @Test
    fun `optional steps left do not require onboarding`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())

        userProfileService.submit(user.id, request(OnboardingMessageCode.SET_DISPLAY_NAME, displayName = "Ann"))

        assertFalse(messageService.isOnboardingRequired(user.id))
    }

    @Test
    fun `skipping an optional step keeps a blocking one required`() {
        val user = userProfileService.getOrCreate(UUID.randomUUID())

        userProfileService.submit(user.id, request(OnboardingMessageCode.COMPLETE_PROFILE))

        assertTrue(messageService.isOnboardingRequired(user.id))
    }

    private fun request(command: OnboardingMessageCode, displayName: String? = null) =
        OnboardingRequest(command = command, displayName = displayName, birthDate = null, gender = null)
}
