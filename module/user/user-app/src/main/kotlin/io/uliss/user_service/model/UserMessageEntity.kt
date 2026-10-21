package io.uliss.user_service.model

import io.uliss.database.entity.AbstractEntity
import jakarta.persistence.EmbeddedId
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table

@Entity
@Table(name = "user_message", schema = "profile")
class UserMessageEntity(
    @EmbeddedId
    var userMessageId: UserMessageId,
    @Enumerated(EnumType.STRING)
    var status: UserMessageStatus = UserMessageStatus.PENDING,
) : AbstractEntity()

