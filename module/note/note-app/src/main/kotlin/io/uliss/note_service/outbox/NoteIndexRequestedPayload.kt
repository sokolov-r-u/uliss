package io.uliss.note_service.outbox

import java.util.UUID

data class NoteIndexRequestedPayload(
    val noteId: UUID,
    val userId: UUID,
)
