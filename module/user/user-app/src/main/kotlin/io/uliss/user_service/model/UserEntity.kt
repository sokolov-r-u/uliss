package io.uliss.user_service.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "users", schema = "profile")
class UserEntity(
    var authId: UUID,
    var displayName: String?,
) : UuidEntity() {

    override fun toString(): String {
        return "UserEntity(id=${id}, authId=$authId, displayName='$displayName'" + super.toString()
    }
}
