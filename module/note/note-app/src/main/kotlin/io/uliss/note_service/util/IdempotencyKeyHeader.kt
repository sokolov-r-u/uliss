package io.uliss.note_service.util

import io.uliss.exception.common.BadRequestException
import java.util.UUID

const val IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"

/** The client's retry key of a request; not a UUID is 400. */
fun parseIdempotencyKey(value: String): UUID =
    try {
        UUID.fromString(value)
    } catch (_: IllegalArgumentException) {
        throw BadRequestException("invalid $IDEMPOTENCY_KEY_HEADER header")
    }
