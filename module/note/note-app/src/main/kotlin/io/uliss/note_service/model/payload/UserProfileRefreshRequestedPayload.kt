package io.uliss.note_service.model.payload

import java.util.UUID

data class UserProfileRefreshRequestedPayload(
    val userId: UUID,
)
