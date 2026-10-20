package io.uliss.note_service.model

import jakarta.persistence.Column
import jakarta.persistence.Embeddable
import java.util.UUID

@Embeddable
data class ChatNoteId(
    @Column(name = "chat_id")
    var chatId: UUID,
    @Column(name = "note_id")
    var noteId: UUID,
)
