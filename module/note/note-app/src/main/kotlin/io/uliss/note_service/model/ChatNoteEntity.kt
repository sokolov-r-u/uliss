package io.uliss.note_service.model

import io.uliss.database.entity.AbstractEntity
import jakarta.persistence.Column
import jakarta.persistence.Embeddable
import jakarta.persistence.EmbeddedId
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.util.Objects
import java.util.UUID

@Entity
@Table(name = "chat_note", schema = "note")
class ChatNoteEntity(
    @EmbeddedId
    var chatNoteId: ChatNoteId,
) : AbstractEntity()

@Embeddable
class ChatNoteId(
    @Column(name = "chat_id")
    var chatId: UUID,
    @Column(name = "note_id")
    var noteId: UUID,
) {

    override fun equals(other: Any?): Boolean {
        if (this === other) {
            return true
        }
        if (other !is ChatNoteId) {
            return false
        }
        return chatId == other.chatId && noteId == other.noteId
    }

    override fun hashCode(): Int {
        return Objects.hash(chatId, noteId)
    }
}
