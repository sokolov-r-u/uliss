package io.uliss.exception.dto

import java.time.Instant

data class ErrorResponse(
    val timestamp: Instant,
    val status: Int,
    val code: String,
    val path: String,
    val details: Map<Any, Any>
)
