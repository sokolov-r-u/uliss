package io.uliss.user_service.onboarding

import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus

interface OnboardingCommand {

    val code: OnboardingMessageCode

    /**
     * Applies the submitted data to the user and returns the resulting message status.
     * COMPLETED when data was provided, SKIPPED when the user dismissed an optional step.
     */
    fun apply(user: UserEntity, request: OnboardingRequest): UserMessageStatus
}
