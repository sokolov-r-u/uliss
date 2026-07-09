package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode.BAD_REQUEST_ERROR
import org.springframework.http.HttpStatus

open class BadRequestException(
    message: String,
    cause: Throwable? = null,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    code: String = BAD_REQUEST_ERROR
) : ServerException(message, cause, httpStatus, code) {
}