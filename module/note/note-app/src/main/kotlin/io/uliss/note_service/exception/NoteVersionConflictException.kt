package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

class NoteVersionConflictException(noteId: UUID, cause: Throwable? = null) : ServerException(
    message = "note id=$noteId changed since the edited version",
    cause = cause,
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_VERSION_CONFLICT",
)
