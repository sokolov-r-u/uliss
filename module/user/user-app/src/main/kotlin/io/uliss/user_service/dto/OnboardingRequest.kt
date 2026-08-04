package io.uliss.user_service.dto

import io.uliss.user_service.model.Gender
import io.uliss.user_service.model.OnboardingMessageCode
import java.time.LocalDate

data class OnboardingRequest(
    val command: OnboardingMessageCode,
    val displayName: String?,
    val birthDate: LocalDate?,
    val gender: Gender?,
)
