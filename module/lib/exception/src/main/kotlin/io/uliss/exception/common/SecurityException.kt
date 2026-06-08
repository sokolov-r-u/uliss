package io.uliss.exception.common

import org.springframework.http.HttpStatus
import io.uliss.exception.utils.ErrorCode

class SecurityException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.FORBIDDEN,
    code: String = ErrorCode.SECURITY_ERROR
    ) : ServerException(message, httpStatus, code) {
}