package io.uliss.exception.common

import io.uliss.exception.utils.ErrorCode
import org.springframework.http.HttpStatus

open class ServerException(
    message: String,
    cause: Throwable? = null,
    val httpStatus: HttpStatus,
    val code: ErrorCode,
    val details: Map<Any, Any> = emptyMap(),
) : RuntimeException(message, cause)

