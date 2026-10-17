package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

class UnsupportedAudioException : ServerException(
    message = "recording is missing or is not a supported audio container",
    httpStatus = HttpStatus.BAD_REQUEST,
    code = "UNSUPPORTED_AUDIO",
)
