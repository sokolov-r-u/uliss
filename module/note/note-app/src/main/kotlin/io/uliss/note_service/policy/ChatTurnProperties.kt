package io.uliss.note_service.policy

import org.springframework.boot.context.properties.ConfigurationProperties

@ConfigurationProperties("note.chat-turn")
data class ChatTurnProperties(
    val maxAttempts: Int = 3,
    val leaseSafetyFactor: Double = 1.3,
)
