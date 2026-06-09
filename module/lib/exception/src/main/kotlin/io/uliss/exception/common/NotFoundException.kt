package io.uliss.exception.common

import org.springframework.http.HttpStatus
import io.uliss.exception.utils.ErrorCode

class NotFoundException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.NOT_FOUND,
    code: String = ErrorCode.NOT_FOUND_ERROR
    ) : ServerException(message, httpStatus, code) {
}