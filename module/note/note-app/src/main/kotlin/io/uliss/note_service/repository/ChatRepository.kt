package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatEntity
import org.springframework.data.repository.CrudRepository
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ChatRepository : CrudRepository<ChatEntity, UUID> {
    fun findByIdAndUserId(id: UUID, userId: UUID): ChatEntity?
    fun findByUserIdOrderByCreatedAtDesc(userId: UUID): List<ChatEntity>
}
