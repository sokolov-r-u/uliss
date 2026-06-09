package io.uliss.exception.common

import org.springframework.http.HttpStatus
import io.uliss.exception.utils.ErrorCode

class BadRequestException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    code: String = ErrorCode.BAD_REQUEST_ERROR
    ) : ServerException(message, httpStatus, code) {
}