package io.uliss.note_service.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

@Entity
@Table(name = "chat", schema = "note")
class ChatEntity(
    @Column(name = "user_id")
    var userId: UUID,
    var title: String,
) : UuidEntity() {

    /** Set and cleared only by `ChatRepository`'s pin queries, so a save of a chat loaded earlier never undoes a pin. */
    @Column(name = "pinned_at", insertable = false, updatable = false)
    var pinnedAt: Instant? = null


    override fun toString(): String {
        return "ChatEntity(id=$id, userId=$userId, title='$title'" + auditFields()
    }
}
