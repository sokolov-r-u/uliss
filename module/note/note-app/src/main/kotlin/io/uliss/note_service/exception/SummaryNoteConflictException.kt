package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus

class SummaryNoteConflictException(message: String) : ServerException(
    message = message,
    httpStatus = HttpStatus.CONFLICT,
    code = "SUMMARY_NOTE_CONFLICT",
)
