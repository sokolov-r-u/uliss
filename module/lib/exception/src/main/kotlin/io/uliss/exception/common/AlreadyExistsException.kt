package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode
import org.springframework.http.HttpStatus

open class AlreadyExistsException(
    message: String,
    httpStatus: HttpStatus,
    code: ErrorCode,
    details: Map<Any, Any> = emptyMap()
) : ServerException(message, null, httpStatus, code, details)