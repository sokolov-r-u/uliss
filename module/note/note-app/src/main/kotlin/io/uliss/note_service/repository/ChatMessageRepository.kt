package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatMessageEntity
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ChatMessageRepository : CrudRepository<ChatMessageEntity, UUID> {
    fun findByChatIdOrderByCreatedAtAscIdAsc(chatId: UUID): List<ChatMessageEntity>

    @Query(
        value = """
            SELECT *
            FROM note.chat_message
            WHERE chat_id = :chatId
            ORDER BY id DESC
        """,
        nativeQuery = true,
    )
    fun findLatestPage(
        @Param("chatId") chatId: UUID,
        pageable: Pageable,
    ): List<ChatMessageEntity>

    @Query(
        value = """
            SELECT *
            FROM note.chat_message
            WHERE chat_id = :chatId
              AND id < :before
            ORDER BY id DESC
        """,
        nativeQuery = true,
    )
    fun findPageBefore(
        @Param("chatId") chatId: UUID,
        @Param("before") before: UUID,
        pageable: Pageable,
    ): List<ChatMessageEntity>

    @Query(
        value = """
            SELECT id
            FROM note.chat_message
            WHERE chat_id = :chatId
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """,
        nativeQuery = true,
    )
    fun findLatestMessageId(@Param("chatId") chatId: UUID): UUID?

    @Query(
        value = """
            SELECT message_row.*
            FROM note.chat_message message_row
            JOIN note.chat_message boundary_row
              ON boundary_row.id = :throughMessageId
             AND boundary_row.chat_id = :chatId
            WHERE message_row.chat_id = :chatId
              AND (message_row.created_at, message_row.id) <= (boundary_row.created_at, boundary_row.id)
            ORDER BY message_row.created_at, message_row.id
        """,
        nativeQuery = true,
    )
    fun findThroughMessage(
        @Param("chatId") chatId: UUID,
        @Param("throughMessageId") throughMessageId: UUID,
    ): List<ChatMessageEntity>
}
