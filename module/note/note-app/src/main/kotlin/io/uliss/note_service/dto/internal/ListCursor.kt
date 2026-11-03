package io.uliss.note_service.dto.internal

import io.uliss.exception.common.BadRequestException
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Base64
import java.util.UUID

/**
 * A keyset position in a list ordered by `updated_at DESC, id DESC`: the next page starts strictly after it. Clients
 * see it as an opaque URL-safe string. The time keeps microseconds, the precision Postgres stores, so a cursor built
 * from a read row compares exactly.
 */
data class ListCursor(val updatedAt: Instant, val id: UUID) {

    fun encode(): String {
        val micros = Math.addExact(Math.multiplyExact(updatedAt.epochSecond, MICROS_PER_SECOND), updatedAt.nano / 1_000L)
        return ENCODER.encodeToString("$micros$SEPARATOR$id".toByteArray())
    }

    companion object {
        private const val SEPARATOR = '|'
        private const val MICROS_PER_SECOND = 1_000_000L
        private val ENCODER = Base64.getUrlEncoder().withoutPadding()
        private val MIN_TIME = Instant.parse("0001-01-01T00:00:00Z")
        private val MAX_TIME = Instant.parse("9999-12-31T23:59:59.999999Z")

        fun decode(value: String): ListCursor = try {
            val (micros, id) = String(Base64.getUrlDecoder().decode(value)).split(SEPARATOR).also { require(it.size == 2) }
            val updatedAt = Instant.EPOCH.plus(micros.toLong(), ChronoUnit.MICROS)
            // a time Postgres cannot bind would fail the query instead of the request
            require(updatedAt in MIN_TIME..MAX_TIME)
            ListCursor(updatedAt, UUID.fromString(id))
        } catch (ex: RuntimeException) {
            throw BadRequestException("invalid cursor", ex)
        }
    }
}
