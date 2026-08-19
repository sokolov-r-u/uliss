package io.uliss.note_service.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "chat_message", schema = "note")
class ChatMessageEntity(
    @Column(name = "chat_id")
    var chatId: UUID,
    @Enumerated(EnumType.STRING)
    var role: ChatMessageRole,
    var content: String,
    @Enumerated(EnumType.STRING)
    var status: ChatMessageStatus,
) : UuidEntity() {

    override fun toString(): String {
        return "ChatMessageEntity(id=$id, chatId=$chatId, role=$role, status=$status" + super.toString()
    }
}
