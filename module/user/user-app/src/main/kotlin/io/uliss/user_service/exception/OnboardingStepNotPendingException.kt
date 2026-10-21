package io.uliss.user_service.exception

import io.uliss.exception.common.ServerException
import io.uliss.user_service.model.OnboardingMessageCode
import org.springframework.http.HttpStatus

/** The step was already completed or skipped (a double submit, another tab) or was never offered to this user. */
class OnboardingStepNotPendingException(code: OnboardingMessageCode) : ServerException(
    message = "onboarding step $code is not pending",
    httpStatus = HttpStatus.CONFLICT,
    code = ONBOARDING_STEP_NOT_PENDING,
)

const val ONBOARDING_STEP_NOT_PENDING = "ONBOARDING_STEP_NOT_PENDING"
