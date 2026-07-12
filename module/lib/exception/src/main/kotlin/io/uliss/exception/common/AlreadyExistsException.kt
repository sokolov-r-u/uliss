package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode.ALREADY_EXISTS_ERROR
import org.springframework.http.HttpStatus

open class AlreadyExistsException(
    message: String,
    httpStatus: HttpStatus = HttpStatus.BAD_REQUEST,
    code: String = ALREADY_EXISTS_ERROR,
    details: Map<Any, Any> = emptyMap()
) : ServerException(message, null, httpStatus, code, details)