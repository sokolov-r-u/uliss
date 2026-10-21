package io.uliss.user_service.onboarding

import io.uliss.user_service.model.Gender
import java.time.LocalDate

/** What a user submitted for an onboarding step, free of transport concerns. */
data class OnboardingInput(
    val displayName: String?,
    val birthDate: LocalDate?,
    val gender: Gender?,
)
