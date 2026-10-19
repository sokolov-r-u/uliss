package io.uliss.note_service.exception

import io.uliss.exception.common.NotFoundException
import java.util.UUID

/** A missing or foreign constellation; the code tells it apart from a missing note or chat in the same request. */
class ConstellationNotFoundException(constellationId: UUID) : NotFoundException(
    message = "constellation id=$constellationId not found",
    code = "CONSTELLATION_NOT_FOUND",
)
