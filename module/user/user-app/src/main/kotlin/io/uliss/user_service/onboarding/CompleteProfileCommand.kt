package io.uliss.user_service.onboarding

import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.springframework.stereotype.Component

@Component
class CompleteProfileCommand : OnboardingCommand {

    override val code = OnboardingMessageCode.COMPLETE_PROFILE

    override fun apply(user: UserEntity, input: OnboardingInput): UserMessageStatus {
        var filled = false
        input.birthDate?.let { user.birthDate = it; filled = true }
        input.gender?.let { user.gender = it; filled = true }
        return if (filled) UserMessageStatus.COMPLETED else UserMessageStatus.SKIPPED
    }
}
