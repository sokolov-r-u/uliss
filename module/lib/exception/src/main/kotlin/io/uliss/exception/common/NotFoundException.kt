package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode.NOT_FOUND_ERROR
import org.springframework.http.HttpStatus

open class NotFoundException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.NOT_FOUND,
    code: String = NOT_FOUND_ERROR
) : ServerException(message, null, httpStatus, code)