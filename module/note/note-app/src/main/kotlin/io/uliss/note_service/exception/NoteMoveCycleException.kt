package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

/** A note cannot live under itself or under one of its own sub-notes. */
class NoteMoveCycleException(noteId: UUID, parentNoteId: UUID) : ServerException(
    message = "note id=$noteId cannot move under its own subtree (parent id=$parentNoteId)",
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_MOVE_CYCLE",
)
