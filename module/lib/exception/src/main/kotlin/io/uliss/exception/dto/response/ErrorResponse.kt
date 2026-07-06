package io.uliss.exception.dto.response

import io.uliss.exception.utils.ErrorCode
import java.time.Instant

data class ErrorResponse(
    val timestamp: Instant,
    val status: Int,
    val code: ErrorCode,
    val path: String,
    val details: Map<Any, Any>
)