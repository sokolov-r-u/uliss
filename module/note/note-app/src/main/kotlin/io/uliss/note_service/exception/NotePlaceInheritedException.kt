package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

/** A sub-note lives where its parent note lives; it has no constellations of its own. */
class NotePlaceInheritedException(noteId: UUID) : ServerException(
    message = "note id=$noteId inherits its place from its parent note",
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_PLACE_INHERITED",
)
