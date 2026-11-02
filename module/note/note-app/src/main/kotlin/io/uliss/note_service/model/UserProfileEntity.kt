package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import io.uliss.note_service.model.projection.NotesMark
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/** What the model knows about the user, compiled from their notes up to [notesThrough]. */
@Entity
@Table(name = "user_profile", schema = "note")
class UserProfileEntity(
    @Column(name = "user_id", updatable = false)
    var userId: UUID,
    var content: String,
    @Column(name = "notes_through_at")
    var notesThroughAt: Instant,
    @Column(name = "notes_through_id")
    var notesThroughId: UUID,
) : AuditEntity() {

    val notesThrough: NotesMark get() = NotesMark(notesThroughAt, notesThroughId)

    override fun toString(): String = "UserProfileEntity(id=$id, userId=$userId, notesThroughAt=$notesThroughAt" +
        ", notesThroughId=$notesThroughId" + auditFields()
}
