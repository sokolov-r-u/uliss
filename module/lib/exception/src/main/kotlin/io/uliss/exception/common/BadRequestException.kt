package io.uliss.exception.common

import org.springframework.http.HttpStatus
import io.uliss.exception.utils.ErrorCode

open class BadRequestException(
    message: String,
    cause: Throwable? = null,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    code: ErrorCode = ErrorCode.BAD_REQUEST_ERROR
    ) : ServerException(message, cause, httpStatus, code) {
}