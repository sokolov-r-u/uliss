package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode
import org.springframework.http.HttpStatus

open class NotFoundException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.NOT_FOUND,
    code: String = ErrorCode.NOT_FOUND_ERROR
) : ServerException(message, httpStatus, code)