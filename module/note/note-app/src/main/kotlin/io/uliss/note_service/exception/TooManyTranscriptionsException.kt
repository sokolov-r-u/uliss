package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

/** Every transcription in flight holds its whole recording in memory; the client keeps the recording and retries. */
class TooManyTranscriptionsException : ServerException(
    message = "too many recordings are being transcribed, try again shortly",
    httpStatus = HttpStatus.TOO_MANY_REQUESTS,
    code = "TOO_MANY_TRANSCRIPTIONS",
)
