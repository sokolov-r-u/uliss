package io.uliss.note_service.dto.internal

/**
 * Whether the profile text is being brought in line with newer rules of the user ([applying]), or that failed for good
 * on the current rules and waits for the nightly retry ([failed]).
 */
data class ProfileRulesState(
    val applying: Boolean,
    val failed: Boolean,
)
