package io.uliss.note_service.model.projection

import java.util.UUID

/** Number of notes linked to one chat; a JPQL constructor projection over `chat_note`. */
data class ChatNoteCount(
    val chatId: UUID,
    val noteCount: Long,
)
