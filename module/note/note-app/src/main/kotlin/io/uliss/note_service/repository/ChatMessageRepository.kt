package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatMessageEntity
import org.springframework.data.repository.CrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ChatMessageRepository : CrudRepository<ChatMessageEntity, UUID> {
    fun findByChatIdOrderByCreatedAtAsc(chatId: UUID): List<ChatMessageEntity>
}
