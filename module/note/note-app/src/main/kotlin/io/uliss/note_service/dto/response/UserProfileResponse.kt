package io.uliss.note_service.dto.response

import io.uliss.note_service.dto.internal.ProfileRebuildState
import io.uliss.note_service.dto.internal.ProfileRulesState
import io.uliss.note_service.dto.internal.UserProfileInput
import io.uliss.note_service.dto.internal.UserProfileView
import java.time.Instant

/**
 * The caller's profile, both fields null until the first refresh writes it, their rebuild state, what they told the
 * profile themselves, and whether the profile is being brought in line with their rules or that failed for good.
 */
data class UserProfileResponse(
    val content: String?,
    val updatedAt: Instant?,
    val rebuild: ProfileRebuildResponse,
    val about: String?,
    val rules: List<String>,
    val applyingRules: Boolean,
    val rulesFailed: Boolean,
)

fun UserProfileView?.toResponse(
    rebuild: ProfileRebuildState,
    input: UserProfileInput,
    rules: ProfileRulesState,
): UserProfileResponse = UserProfileResponse(
    this?.content, this?.updatedAt, rebuild.toResponse(), input.about, input.rules, rules.applying, rules.failed,
)
