package io.uliss.note_service.dto.request

import java.util.UUID

/** The new parent; null makes the constellation a root. */
data class MoveConstellationRequest(
    val parentId: UUID? = null,
)
