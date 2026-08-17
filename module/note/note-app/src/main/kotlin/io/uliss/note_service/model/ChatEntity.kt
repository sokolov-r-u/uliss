package io.uliss.note_service.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "chat", schema = "note")
class ChatEntity(
    @Column(name = "user_id")
    var userId: UUID,
    var title: String,
) : UuidEntity() {

    override fun toString(): String {
        return "ChatEntity(id=$id, userId=$userId, title='$title'" + super.toString()
    }
}
