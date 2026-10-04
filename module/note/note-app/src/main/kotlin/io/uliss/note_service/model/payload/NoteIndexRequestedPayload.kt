package io.uliss.note_service.model.payload

import java.util.UUID

data class NoteIndexRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
)
