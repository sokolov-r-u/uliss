package io.uliss.exception.handler

import io.uliss.exception.common.ServerException
import io.uliss.exception.dto.ErrorResponse
import io.uliss.exception.utils.ErrorCode
import io.uliss.exception.utils.MESSAGE_KEY
import io.uliss.exception.utils.UNKNOWN_PATH
import io.uliss.exception.utils.URI_PREFIX
import jakarta.validation.ConstraintViolationException
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.ResponseEntity
import org.springframework.validation.BindException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler
import java.time.Instant

@ControllerAdvice
class GlobalExceptionHandler : ResponseEntityExceptionHandler() {

    @ExceptionHandler(ServerException::class)
    fun handleServerException(ex: ServerException, request: WebRequest): ResponseEntity<Any>? =
        handleException(ex, ex.httpStatus, request)

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolationException(
        ex: ConstraintViolationException,
        request: WebRequest
    ): ResponseEntity<Any>? =
        handleException(ex, HttpStatus.BAD_REQUEST, request)

    override fun handleMethodArgumentNotValid(
        ex: MethodArgumentNotValidException,
        headers: HttpHeaders,
        status: HttpStatusCode,
        request: WebRequest
    ): ResponseEntity<Any>? {
        return handleException(ex, status as HttpStatus, request)
    }

    private fun handleException(ex: Exception, httpStatus: HttpStatus, request: WebRequest): ResponseEntity<Any>? {
        val response = getExceptionResponse(ex, httpStatus, request)
        return handleExceptionInternal(ex, response, HttpHeaders(), httpStatus, request)
    }

    private fun getExceptionResponse(ex: Exception, httpStatus: HttpStatus, request: WebRequest): ErrorResponse =
        ErrorResponse(
            timestamp = Instant.now(),
            status = httpStatus.value(),
            code = getErrorCode(ex),
            path = getPath(request),
            details = getDetails(ex),
        )

    private fun getErrorCode(ex: Exception): String = when (ex) {
        is ServerException -> ex.code
        is BindException -> ErrorCode.VALIDATION_ERROR
        is ConstraintViolationException -> ErrorCode.VALIDATION_ERROR
        else -> ErrorCode.UNKNOWN_ERROR
    }

    private fun getPath(request: WebRequest): String {
        val path = request.getDescription(false)
        return if (path.startsWith(URI_PREFIX)) path.substring(URI_PREFIX.length) else UNKNOWN_PATH
    }

    private fun getDetails(ex: Exception): Map<Any, Any> =
        when (ex) {
            is ServerException -> {
                ex.details
            }

            is BindException -> {
                ex.bindingResult.fieldErrors
                    .mapNotNull { it.defaultMessage?.let { msg -> it.field to msg } }
                    .toMap()
            }

            is ConstraintViolationException -> {
                ex.constraintViolations.associate { it.propertyPath.toString() to it.message }
            }

            else -> {
                ex.message?.let { mapOf(MESSAGE_KEY to it) } ?: emptyMap()
            }
        }
}