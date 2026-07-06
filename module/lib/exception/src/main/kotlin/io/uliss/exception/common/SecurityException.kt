package io.uliss.exception.common

import org.springframework.http.HttpStatus
import io.uliss.exception.utils.ErrorCode

open class SecurityException(
    message: String,
    cause: Throwable? = null,
    httpStatus: HttpStatus = HttpStatus.FORBIDDEN,
    code: ErrorCode = ErrorCode.SECURITY_ERROR
    ) : ServerException(message, cause, httpStatus, code)