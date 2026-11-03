package io.uliss.note_service.util

import io.uliss.exception.common.BadRequestException
import java.util.UUID

/** How many constellations one note list request may filter by. */
object NoteListFilterLimit {
    const val MAX_CONSTELLATIONS = 50

    fun check(constellationIds: Set<UUID>) {
        if (constellationIds.size > MAX_CONSTELLATIONS) {
            throw BadRequestException("at most $MAX_CONSTELLATIONS constellations")
        }
    }
}
