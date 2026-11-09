package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.time.Instant
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
    var title: String? = null,
    /**
     * A sub-note lives where this parent note lives and has no memberships of its own. `NoteHierarchyStore` changes it
     * through JDBC without bumping the version, so JPA never writes it back: a stale save would undo a move.
     */
    @Column(name = "parent_note_id", updatable = false)
    var parentNoteId: UUID? = null,
    /** The user's emoji shown before the title (`NoteIconNormalizer`); the model never sets it. */
    var icon: String? = null,
) : AuditEntity() {

    /** Set and cleared only by `NoteRepository`'s pin queries, so a save of a note loaded earlier never undoes a pin. */
    @Column(name = "pinned_at", insertable = false, updatable = false)
    var pinnedAt: Instant? = null

    /** The note poster link (`PosterUrlNormalizer`); set and cleared only by `NoteRepository`'s poster queries. */
    @Column(name = "poster_url", insertable = false, updatable = false)
    var posterUrl: String? = null

    /** The create request's body fingerprint of a manual note (`ManualNoteFingerprint`); written only on insert. */
    @Column(name = "request_fingerprint", insertable = false, updatable = false)
    var requestFingerprint: ByteArray? = null

    override fun toString(): String {
        return "NoteEntity(id=$id, userId=$userId, source=$source, status=$status" + auditFields()
    }
}
