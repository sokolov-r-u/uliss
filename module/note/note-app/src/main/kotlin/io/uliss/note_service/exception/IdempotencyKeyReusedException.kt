package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

/** [details] point the client at what the key already made, e.g. `noteId` of a created note. */
class IdempotencyKeyReusedException(details: Map<Any, Any> = emptyMap()) : ServerException(
    message = "idempotency key was already used for another request",
    httpStatus = HttpStatus.CONFLICT,
    code = "IDEMPOTENCY_KEY_REUSED",
    details = details,
)
