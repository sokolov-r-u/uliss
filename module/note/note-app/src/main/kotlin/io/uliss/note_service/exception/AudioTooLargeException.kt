package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

class AudioTooLargeException : ServerException(
    message = "recording exceeds the size limit",
    httpStatus = HttpStatus.PAYLOAD_TOO_LARGE,
    code = "AUDIO_TOO_LARGE",
)
