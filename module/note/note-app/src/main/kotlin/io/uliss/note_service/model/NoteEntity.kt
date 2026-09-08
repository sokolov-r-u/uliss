package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "notes", schema = "note")
class NoteEntity(
    @Column(name = "user_id")
    var userId: UUID,
    var content: String?,
    @Enumerated(EnumType.STRING)
    var source: NoteSource = NoteSource.MANUAL,
    @Enumerated(EnumType.STRING)
    var status: NoteStatus = NoteStatus.READY,
) : AuditEntity() {

    override fun toString(): String {
        return "NoteEntity(id=$id, userId=$userId, source=$source, status=$status" + super.toString()
    }
}
