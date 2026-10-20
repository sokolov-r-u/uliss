package io.uliss.note_service.model

import io.uliss.database.entity.AbstractEntity
import jakarta.persistence.Column
import jakarta.persistence.EmbeddedId
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "chat_note", schema = "note")
class ChatNoteEntity(
    @EmbeddedId
    var chatNoteId: ChatNoteId,
    /** Last chat message this summary note covers; null for notes created before boundaries existed. */
    @Column(name = "summarized_through_message_id")
    var summarizedThroughMessageId: UUID? = null,
) : AbstractEntity()
