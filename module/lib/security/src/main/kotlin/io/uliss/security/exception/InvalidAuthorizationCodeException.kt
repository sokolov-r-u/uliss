package io.uliss.security.exception

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.utils.ErrorCode.AUTHORIZATION_CODE_ERROR

class InvalidAuthorizationCodeException(
    message: String,
    cause: Throwable? = null
) : BadRequestException(message = message, cause = cause, code = AUTHORIZATION_CODE_ERROR)
