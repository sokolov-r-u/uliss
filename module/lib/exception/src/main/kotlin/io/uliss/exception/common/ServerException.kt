package io.uliss.exception.common

import org.springframework.http.HttpStatus

open class ServerException(
    message: String,
    cause: Throwable? = null,
    val httpStatus: HttpStatus,
    val code: String,
    val details: Map<Any, Any> = emptyMap(),
) : RuntimeException(message, cause)

