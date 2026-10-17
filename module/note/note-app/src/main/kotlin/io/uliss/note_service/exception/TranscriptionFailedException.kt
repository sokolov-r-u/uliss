package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

class TranscriptionFailedException(cause: Throwable) : ServerException(
    message = "speech provider failed to transcribe the recording",
    cause = cause,
    httpStatus = HttpStatus.BAD_GATEWAY,
    code = "TRANSCRIPTION_FAILED",
)
