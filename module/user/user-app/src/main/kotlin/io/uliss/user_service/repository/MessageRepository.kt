package io.uliss.user_service.repository

import io.uliss.user_service.model.MessageEntity
import org.springframework.data.repository.CrudRepository
import java.util.UUID

interface MessageRepository : CrudRepository<MessageEntity, UUID> {
    fun findByCode(code: String): MessageEntity?
}
