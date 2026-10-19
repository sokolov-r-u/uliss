package io.uliss.note_service.exception

import io.uliss.exception.common.NotFoundException
import java.util.UUID

/** A missing or foreign parent note; the code tells it apart from the missing note being moved or summarized. */
class ParentNoteNotFoundException(parentNoteId: UUID) : NotFoundException(
    message = "parent note id=$parentNoteId not found",
    code = "PARENT_NOTE_NOT_FOUND",
)
