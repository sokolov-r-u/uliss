package io.uliss.note_service.util

import io.uliss.exception.common.BadRequestException
import java.util.UUID

/** The constellation filter of a note list request. */
object NoteListFilter {
    const val MAX_CONSTELLATIONS = 50

    /**
     * The distinct constellation ids of the request. Spring binds an empty `constellationId=` among several values as
     * null, hence the nullable elements; such a value is not a uuid and is rejected like any other.
     */
    fun of(constellationIds: List<UUID?>?): Set<UUID> {
        val ids = constellationIds.orEmpty()
        if (ids.any { it == null }) throw BadRequestException("constellationId must be a uuid")
        val distinct = ids.filterNotNull().toSet()
        if (distinct.size > MAX_CONSTELLATIONS) throw BadRequestException("at most $MAX_CONSTELLATIONS constellations")
        return distinct
    }
}
