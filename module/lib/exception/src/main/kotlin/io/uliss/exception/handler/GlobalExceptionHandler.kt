package io.uliss.exception.handler

import io.uliss.exception.common.ServerException
import io.uliss.exception.dto.response.ErrorResponse
import io.uliss.exception.utils.ErrorCode
import io.uliss.exception.utils.MESSAGE_KEY
import io.uliss.exception.utils.UNKNOWN_PATH
import io.uliss.exception.utils.URI_PREFIX
import io.uliss.exception.utils.isConstraintRace
import io.uliss.logging.logger.AppLogger
import jakarta.validation.ConstraintViolationException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.validation.BindException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingRequestCookieException
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.client.ResourceAccessException
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler
import java.time.Instant

private const val UNREADABLE_BODY = "request body is not readable"

@ControllerAdvice
class GlobalExceptionHandler : ResponseEntityExceptionHandler() {
    private val log = AppLogger.of(GlobalExceptionHandler::class)

    @ExceptionHandler(ServerException::class)
    fun handleServerException(ex: ServerException, request: WebRequest): ResponseEntity<Any>? =
        handleException(ex, ex.httpStatus, request)

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolationException(
        ex: ConstraintViolationException,
        request: WebRequest
    ): ResponseEntity<Any>? =
        handleException(ex, HttpStatus.BAD_REQUEST, request)

    @ExceptionHandler(ResourceAccessException::class)
    fun handleRetryException(ex: ResourceAccessException, request: WebRequest): ResponseEntity<Any>? =
        handleException(ex, HttpStatus.SERVICE_UNAVAILABLE, request)

    @ExceptionHandler(MissingRequestCookieException::class)
    fun handleMissingCookie(ex: MissingRequestCookieException, request: WebRequest): ResponseEntity<Any>? =
        handleException(ex, HttpStatus.BAD_REQUEST, request)

    /** A concurrent write won: the client retries on fresh data (e.g. a double submit or two tabs). */
    @ExceptionHandler(OptimisticLockingFailureException::class)
    fun handleOptimisticLock(ex: OptimisticLockingFailureException, request: WebRequest): ResponseEntity<Any>? =
        handleException(ex, HttpStatus.CONFLICT, request)

    /**
     * A unique or foreign key violation lost a race: 409, the client reloads. Any other violation is missing validation,
     * logged as a server error. The database message (table and constraint names) stays in the log either way.
     */
    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolation(ex: DataIntegrityViolationException, request: WebRequest): ResponseEntity<Any>? =
        handleException(ex, if (ex.isConstraintRace()) HttpStatus.CONFLICT else HttpStatus.INTERNAL_SERVER_ERROR, request)

    @ExceptionHandler(RuntimeException::class)
    fun handleRuntimeException(ex: RuntimeException, request: WebRequest): ResponseEntity<Any>? {
        return handleException(ex, HttpStatus.INTERNAL_SERVER_ERROR, request)
    }

    override fun handleMethodArgumentNotValid(
        ex: MethodArgumentNotValidException,
        headers: HttpHeaders,
        status: HttpStatusCode,
        request: WebRequest
    ): ResponseEntity<Any>? {
        return handleException(ex, status as HttpStatus, request)
    }

    /** Standard MVC errors (unreadable body, 405, 415, ...) get the same [ErrorResponse] as ours, not ProblemDetail. */
    override fun handleExceptionInternal(
        ex: Exception,
        body: Any?,
        headers: HttpHeaders,
        statusCode: HttpStatusCode,
        request: WebRequest,
    ): ResponseEntity<Any>? {
        if (body is ErrorResponse) return super.handleExceptionInternal(ex, body, headers, statusCode, request)
        return handleException(ex, HttpStatus.valueOf(statusCode.value()), request, headers)
    }

    private fun handleException(
        ex: Exception,
        httpStatus: HttpStatus,
        request: WebRequest,
        headers: HttpHeaders = HttpHeaders(),
    ): ResponseEntity<Any>? {
        val response = getExceptionResponse(ex, httpStatus, request)
        // the only place an HTTP request failure is logged; 5xx keeps the single stack trace, 4xx is the client's
        if (httpStatus.is5xxServerError) {
            log.error("server error on ${response.path}", "handleException", ex)
        } else {
            log.info(
                "client error ${httpStatus.value()} ${response.code} on ${response.path}: ${clientErrorSummary(ex)}",
                "handleException",
            )
            // rejected values may hold user content (a prompt, a note): only while debugging
            log.debug("handleException") { "client error detail on ${response.path}: ${ex.message}" }
        }
        // an explicit type skips the Accept check, so an event-stream request still gets the JSON error
        val jsonHeaders = HttpHeaders(headers).apply { contentType = MediaType.APPLICATION_JSON }
        return handleExceptionInternal(ex, response, jsonHeaders, httpStatus, request)
    }

    /** Field names and constraint codes only: a binding message carries the rejected value. */
    private fun clientErrorSummary(ex: Exception): String = when (ex) {
        is BindException -> ex.bindingResult.fieldErrors.joinToString(prefix = "invalid fields ") { "${it.field}:${it.code}" }
        is ConstraintViolationException -> ex.constraintViolations.joinToString(prefix = "invalid values ") {
            "${it.propertyPath}:${it.constraintDescriptor.annotation.annotationClass.simpleName}"
        }
        is HttpMessageNotReadableException -> UNREADABLE_BODY
        is DataIntegrityViolationException -> "constraint violation"
        else -> ex.message.orEmpty()
    }

    private fun getExceptionResponse(ex: Exception, httpStatus: HttpStatus, request: WebRequest): ErrorResponse =
        ErrorResponse(
            timestamp = Instant.now(),
            status = httpStatus.value(),
            code = getErrorCode(ex, httpStatus),
            path = getPath(request),
            details = getDetails(ex, httpStatus),
        )

    private fun getErrorCode(ex: Exception, httpStatus: HttpStatus): String = when {
        ex is ServerException -> ex.code
        ex is BindException -> ErrorCode.VALIDATION_ERROR
        ex is ConstraintViolationException -> ErrorCode.VALIDATION_ERROR
        ex is ResourceAccessException -> ErrorCode.INTERNAL_ERROR
        ex is OptimisticLockingFailureException -> ErrorCode.VERSION_CONFLICT
        ex is DataIntegrityViolationException && httpStatus == HttpStatus.CONFLICT -> ErrorCode.CONFLICT
        httpStatus == HttpStatus.NOT_FOUND -> ErrorCode.NOT_FOUND_ERROR
        httpStatus.is4xxClientError -> ErrorCode.BAD_REQUEST_ERROR
        else -> ErrorCode.UNKNOWN_ERROR
    }

    private fun getPath(request: WebRequest): String {
        val path = request.getDescription(false)
        return if (path.startsWith(URI_PREFIX)) path.substring(URI_PREFIX.length) else UNKNOWN_PATH
    }

    /** Unexpected 5xx messages (SQL, internal URLs) stay in the log; the client gets only status and code. */
    private fun getDetails(ex: Exception, httpStatus: HttpStatus): Map<Any, Any> =
        when (ex) {
            is ServerException -> {
                // our own 4xx messages explain the refusal ("displayName is required"); 5xx stay in the log
                if (ex.details.isEmpty() && httpStatus.is4xxClientError) mapOf(MESSAGE_KEY to ex.message.orEmpty())
                else ex.details
            }

            is HttpMessageNotReadableException -> mapOf(MESSAGE_KEY to UNREADABLE_BODY)

            is OptimisticLockingFailureException, is DataIntegrityViolationException -> emptyMap()

            is BindException -> {
                ex.bindingResult.fieldErrors
                    .mapNotNull { it.defaultMessage?.let { msg -> it.field to msg } }
                    .toMap()
            }

            is ConstraintViolationException -> {
                ex.constraintViolations.associate { it.propertyPath.toString() to it.message }
            }

            else -> {
                if (httpStatus.is5xxServerError) emptyMap()
                else ex.message?.let { mapOf(MESSAGE_KEY to it) } ?: emptyMap()
            }
        }
}