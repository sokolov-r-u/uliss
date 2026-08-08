package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "notes", schema = "note")
class NoteEntity(
    @Column(name = "user_id")
    var userId: UUID,
    var content: String,
) : AuditEntity() {

    override fun toString(): String {
        return "NoteEntity(id=$id, userId=$userId" + super.toString()
    }
}
