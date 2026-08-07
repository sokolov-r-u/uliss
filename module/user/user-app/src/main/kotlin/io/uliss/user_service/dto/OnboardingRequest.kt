package io.uliss.user_service.dto

import io.uliss.user_service.model.DISPLAY_NAME_MAX_LENGTH
import io.uliss.user_service.model.Gender
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.validation.annotation.BirthDate
import jakarta.validation.constraints.Size
import java.time.LocalDate

data class OnboardingRequest(
    val command: OnboardingMessageCode,
    @field:Size(max = DISPLAY_NAME_MAX_LENGTH, message = "Display name must not exceed {max} characters.")
    val displayName: String?,
    @field:BirthDate
    val birthDate: LocalDate?,
    val gender: Gender?,
)
