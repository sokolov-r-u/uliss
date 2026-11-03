package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import io.uliss.note_service.model.projection.NotesMark
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.time.Instant
import java.util.UUID

/**
 * One full rebuild of the user profile, started at `createdAt`. While it runs, it writes the profile from the first note
 * into its own draft ([content] up to [through]); the live profile is replaced only when the last batch is read.
 */
@Entity
@Table(name = "user_profile_rebuild", schema = "note")
class UserProfileRebuildEntity(
    @Column(name = "user_id", updatable = false)
    var userId: UUID,
    @Enumerated(EnumType.STRING)
    @Column(updatable = false)
    var trigger: ProfileRebuildTrigger,
    @Enumerated(EnumType.STRING)
    var status: ProfileRebuildStatus = ProfileRebuildStatus.RUNNING,
    var content: String? = null,
    @Column(name = "through_at")
    var throughAt: Instant? = null,
    @Column(name = "through_id")
    var throughId: UUID? = null,
    @Column(name = "batch_shrink")
    var batchShrink: Int = 0,
    @Column(name = "finished_at")
    var finishedAt: Instant? = null,
) : AuditEntity() {

    val through: NotesMark? get() = throughAt?.let { at -> throughId?.let { NotesMark(at, it) } }

    override fun toString(): String = "UserProfileRebuildEntity(id=$id, userId=$userId, trigger=$trigger" +
        ", status=$status, throughAt=$throughAt, throughId=$throughId, batchShrink=$batchShrink" +
        ", finishedAt=$finishedAt" + auditFields()
}
