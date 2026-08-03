package io.uliss.user_service.model

import jakarta.persistence.Column
import jakarta.persistence.Embeddable
import jakarta.persistence.EmbeddedId
import jakarta.persistence.Entity
import jakarta.persistence.Table
import java.util.UUID

@Entity
@Table(name = "user_message", schema = "profile")
class UserMessageEntity(
    @EmbeddedId
    var userMessageId: UserMessageId,
    var status: String = "PENDING"
)


@Embeddable
class UserMessageId(
    @Column(name = "user_id")
    var userId: UUID,
    @Column(name = "message_id")
    var messageId: UUID,
)