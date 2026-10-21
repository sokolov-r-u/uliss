package io.uliss.note_service.model

import io.uliss.database.entity.AuditEntity
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.util.UUID

/** A node of the user's constellation tree: a root has a [hue], a sub-constellation a [lightness]. */
@Entity
@Table(name = "constellations", schema = "note")
class ConstellationEntity(
    @Column(name = "user_id")
    var userId: UUID,
    @Column(name = "parent_id")
    var parentId: UUID?,
    var name: String,
    var hue: Int?,
    @Enumerated(EnumType.STRING)
    var lightness: ConstellationLightness?,
) : AuditEntity() {

    override fun toString(): String {
        return "ConstellationEntity(id=$id, userId=$userId, parentId=$parentId, name='$name', hue=$hue, " +
            "lightness=$lightness" + auditFields()
    }
}
