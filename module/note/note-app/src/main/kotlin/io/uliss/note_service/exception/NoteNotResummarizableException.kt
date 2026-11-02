package io.uliss.note_service.exception

import io.uliss.exception.common.ServerException
import org.springframework.http.HttpStatus
import java.util.UUID

/** Only a summary note whose chat still exists can be summarized again. */
class NoteNotResummarizableException(noteId: UUID) : ServerException(
    message = "note id=$noteId has no chat to summarize again",
    httpStatus = HttpStatus.CONFLICT,
    code = "NOTE_NOT_RESUMMARIZABLE",
)
