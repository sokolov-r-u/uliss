package io.uliss.user_service.model

import io.uliss.database.entity.AbstractEntity
import jakarta.persistence.Column
import jakarta.persistence.Embeddable
import jakarta.persistence.EmbeddedId
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Table
import java.util.Objects
import java.util.UUID

@Entity
@Table(name = "user_message", schema = "profile")
class UserMessageEntity(
    @EmbeddedId
    var userMessageId: UserMessageId,
    @Enumerated(EnumType.STRING)
    var status: UserMessageStatus = UserMessageStatus.PENDING,
) : AbstractEntity()


@Embeddable
class UserMessageId(
    @Column(name = "user_id")
    var userId: UUID,
    @Column(name = "message_id")
    var messageId: UUID,
) {

    override fun equals(other: Any?): Boolean {
        if (this === other) {
            return true
        }
        if (other !is UserMessageId) {
            return false
        }
        return userId == other.userId && messageId == other.messageId
    }

    override fun hashCode(): Int {
        return Objects.hash(userId, messageId)
    }
}
