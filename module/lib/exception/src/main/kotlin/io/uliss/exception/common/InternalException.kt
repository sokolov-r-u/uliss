package io.uliss.exception.common

import org.springframework.http.HttpStatus
import io.uliss.exception.utils.ErrorCode

class InternalException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: String = ErrorCode.INTERNAL_ERROR
    ) : ServerException(message, httpStatus, code) {
}