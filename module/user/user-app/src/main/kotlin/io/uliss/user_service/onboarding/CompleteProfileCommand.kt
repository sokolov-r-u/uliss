package io.uliss.user_service.onboarding

import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.springframework.stereotype.Component

@Component
class CompleteProfileCommand : OnboardingCommand {

    override val code = OnboardingMessageCode.COMPLETE_PROFILE

    override fun apply(user: UserEntity, request: OnboardingRequest): UserMessageStatus {
        var filled = false
        request.birthDate?.let { user.birthDate = it; filled = true }
        request.gender?.let { user.gender = it; filled = true }
        return if (filled) UserMessageStatus.COMPLETED else UserMessageStatus.SKIPPED
    }
}
