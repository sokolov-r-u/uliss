package io.uliss.note_service.model

/** Why a full rebuild of the user profile ran: the user asked for it, or notes it had read were deleted. */
enum class ProfileRebuildTrigger {
    USER,
    DELETIONS,
}
