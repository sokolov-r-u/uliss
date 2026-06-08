package io.uliss.exception.common

import org.springframework.http.HttpStatus

open class AlreadyExistsException(
    message: String,
    httpStatus: HttpStatus,
    code: String,
    details: Map<Any, Any> = emptyMap()
) : ServerException(message, httpStatus, code, details)