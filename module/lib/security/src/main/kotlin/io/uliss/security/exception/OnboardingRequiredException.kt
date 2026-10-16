package io.uliss.security.exception

import io.uliss.exception.common.SecurityException
import io.uliss.exception.utils.ErrorCode.ONBOARDING_REQUIRED

class OnboardingRequiredException : SecurityException("blocking onboarding steps are pending", code = ONBOARDING_REQUIRED)
