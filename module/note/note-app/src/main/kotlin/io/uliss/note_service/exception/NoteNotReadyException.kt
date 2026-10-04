package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class NoteNotReadyException(noteId: UUID) : ServerException(
    message = "note id=$noteId is not ready",
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_NOT_READY",
)
