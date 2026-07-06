package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode
import org.springframework.http.HttpStatus

open class InternalException(
    message: String,
    cause: Throwable? = null,
    httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
) : ServerException(message, cause, httpStatus, code) {
}