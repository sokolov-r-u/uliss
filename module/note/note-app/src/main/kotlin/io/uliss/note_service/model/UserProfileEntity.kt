package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import io.uliss.note_service.model.projection.NotesMark
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * What the model knows about the user, compiled from their notes up to [notesThrough]. A row without [content] has no
 * profile yet but still holds the mark, the batch shrink, and the deletion flag.
 */
@Entity
@Table(name = "user_profile", schema = "note")
class UserProfileEntity(
    @Column(name = "user_id", updatable = false)
    var userId: UUID,
    var content: String?,
    @Column(name = "notes_through_at")
    var notesThroughAt: Instant?,
    @Column(name = "notes_through_id")
    var notesThroughId: UUID?,
) : AuditEntity() {

    /** When a note the profile had read was last deleted; cleared by a full rebuild started after it. */
    @Column(name = "last_deletion_at")
    var lastDeletionAt: Instant? = null

    /** How many times the next batch is halved after it failed for good. */
    @Column(name = "batch_shrink")
    var batchShrink: Int = 0

    /** The version of the user's rules the text was written under. */
    @Column(name = "rules_version")
    var rulesVersion: Int = 0

    /** The version of the user's rules that applying failed on for good; retried at night. */
    @Column(name = "rules_failed_version")
    var rulesFailedVersion: Int? = null

    val notesThrough: NotesMark? get() = notesThroughAt?.let { at -> notesThroughId?.let { NotesMark(at, it) } }

    override fun toString(): String = "UserProfileEntity(id=$id, userId=$userId, notesThroughAt=$notesThroughAt" +
        ", notesThroughId=$notesThroughId, lastDeletionAt=$lastDeletionAt, batchShrink=$batchShrink" +
        ", rulesVersion=$rulesVersion, rulesFailedVersion=$rulesFailedVersion" + auditFields()
}
