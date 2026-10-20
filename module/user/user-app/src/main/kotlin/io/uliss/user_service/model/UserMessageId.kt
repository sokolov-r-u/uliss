package io.uliss.user_service.model

import jakarta.persistence.Column
import jakarta.persistence.Embeddable
import java.util.UUID

@Embeddable
data class UserMessageId(
    @Column(name = "user_id")
    var userId: UUID,
    @Column(name = "message_id")
    var messageId: UUID,
)
