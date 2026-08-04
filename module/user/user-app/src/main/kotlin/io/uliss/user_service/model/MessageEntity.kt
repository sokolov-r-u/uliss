package io.uliss.user_service.model

import io.uliss.database.entity.UuidEntity
import jakarta.persistence.Entity
import jakarta.persistence.Table

@Entity
@Table(name = "messages", schema = "profile")
class MessageEntity(
    var code: String,
    var blocking: Boolean = false,
) : UuidEntity()
