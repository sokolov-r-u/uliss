package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode.SECURITY_ERROR
import org.springframework.http.HttpStatus

open class SecurityException(
    message: String,
    cause: Throwable? = null,
    httpStatus: HttpStatus = HttpStatus.FORBIDDEN,
    code: String = SECURITY_ERROR
) : ServerException(message, cause, httpStatus, code)