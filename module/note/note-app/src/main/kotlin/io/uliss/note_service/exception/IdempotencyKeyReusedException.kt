package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

class IdempotencyKeyReusedException : ServerException(
    message = "idempotency key was already used for another request",
    httpStatus = HttpStatus.CONFLICT,
    code = "IDEMPOTENCY_KEY_REUSED",
)
