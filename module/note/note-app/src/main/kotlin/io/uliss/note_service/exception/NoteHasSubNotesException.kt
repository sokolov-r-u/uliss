package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

/** Deleting a note with sub-notes needs the user's choice: keep them or delete them too. */
class NoteHasSubNotesException(noteId: UUID) : ServerException(
    message = "note id=$noteId has sub-notes; choose whether to keep or delete them",
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_HAS_SUB_NOTES",
)
