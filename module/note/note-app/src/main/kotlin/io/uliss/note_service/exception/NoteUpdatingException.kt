package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class NoteUpdatingException(noteId: UUID) : ServerException(
    message = "note id=$noteId has a summary update in progress",
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_UPDATING",
)
