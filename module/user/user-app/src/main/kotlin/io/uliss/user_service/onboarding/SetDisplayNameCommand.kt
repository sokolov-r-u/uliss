package io.uliss.user_service.onboarding

import io.uliss.exception.common.BadRequestException
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import org.springframework.stereotype.Component

@Component
class SetDisplayNameCommand : OnboardingCommand {

    override val code = OnboardingMessageCode.SET_DISPLAY_NAME

    override fun apply(user: UserEntity, request: OnboardingRequest): UserMessageStatus {
        val displayName = request.displayName?.trim()?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("displayName is required")
        user.displayName = displayName
        return UserMessageStatus.COMPLETED
    }
}
