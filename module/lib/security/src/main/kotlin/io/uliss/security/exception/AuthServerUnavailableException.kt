package io.uliss.security.exception

import io.uliss.exception.common.InternalException
import org.springframework.http.HttpStatus

/** Retried by the mediator; reported as [httpStatus] once the retries are spent. */
class AuthServerUnavailableException(
    message: String,
    cause: Throwable? = null,
    httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
) : InternalException(message, cause, httpStatus)
