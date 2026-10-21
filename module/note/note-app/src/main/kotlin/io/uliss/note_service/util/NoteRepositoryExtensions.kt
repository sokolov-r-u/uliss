package io.uliss.note_service.util

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteRepository
import java.util.UUID

/** The user's note; a foreign note is indistinguishable from a missing one. */
fun NoteRepository.getOwnedNote(userId: UUID, noteId: UUID): NoteEntity =
    findByIdAndUserId(noteId, userId) ?: throw NotFoundException("note id=$noteId not found")
