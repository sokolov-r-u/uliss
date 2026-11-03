package io.uliss.note_service.util

import io.uliss.exception.common.BadRequestException

/** Page sizes of the chat and note lists. */
object ListPageLimit {
    const val DEFAULT = 30
    private const val MIN = 1
    private const val MAX = 100

    fun check(limit: Int) {
        if (limit !in MIN..MAX) throw BadRequestException("limit must be between $MIN and $MAX")
    }
}
