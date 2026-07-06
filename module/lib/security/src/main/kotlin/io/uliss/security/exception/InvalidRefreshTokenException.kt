package io.uliss.security.exception

import io.uliss.exception.common.SecurityException
import io.uliss.exception.utils.ErrorCode
import org.springframework.http.HttpStatus

class InvalidRefreshTokenException(
    message: String,
    cause: Throwable? = null
) : SecurityException(message, cause, HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_REFRESH_TOKEN_ERROR)