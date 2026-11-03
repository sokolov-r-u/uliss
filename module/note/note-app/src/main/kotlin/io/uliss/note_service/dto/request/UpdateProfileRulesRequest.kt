package io.uliss.note_service.dto.request

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Size

/** The user's rules for writing their profile, the whole list in order. */
data class UpdateProfileRulesRequest(
    @field:Size(max = MAX_RULES)
    val rules: List<String>,
) {
    // Kotlin does not emit constraints on type arguments, so each rule is checked here
    @get:JsonIgnore
    @get:AssertTrue(message = "each rule must be non-blank and at most $MAX_RULE_CHARS characters")
    val isEachRuleValid: Boolean
        get() = rules.all { it.isNotBlank() && it.length <= MAX_RULE_CHARS }

    private companion object {
        const val MAX_RULES = 20
        const val MAX_RULE_CHARS = 300
    }
}
