package io.uliss.security.utils

import org.springframework.security.oauth2.jwt.Jwt
import java.util.UUID

const val USER_ID_CLAIM = "userId"

/** Present and `true` while the user has blocking onboarding steps pending (set by auth from user-service). */
const val ONBOARDING_REQUIRED_CLAIM = "onboardingRequired"

fun Jwt.getUserId(): UUID = UUID.fromString(getClaimAsString(USER_ID_CLAIM))

fun Jwt.isOnboardingRequired(): Boolean = getClaimAsBoolean(ONBOARDING_REQUIRED_CLAIM) == true
