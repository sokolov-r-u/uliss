package io.uliss.security.exception

import io.uliss.exception.common.InternalException

class AuthServerUnavailableException(
    message: String,
    cause: Throwable? = null
) : InternalException(message, cause) {
}