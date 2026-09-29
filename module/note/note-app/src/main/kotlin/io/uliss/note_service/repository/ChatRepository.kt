package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatEntity
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface ChatRepository : CrudRepository<ChatEntity, UUID> {

    @Modifying
    @Query(
        nativeQuery = true,
        value = """
            INSERT INTO note.chat (id, user_id, idempotency_key, title, created_at, updated_at, version)
            VALUES (:id, :userId, :idempotencyKey, :title, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
        """,
    )
    fun insertChatOnConflictDoNothing(
        @Param("id") id: UUID,
        @Param("userId") userId: UUID,
        @Param("idempotencyKey") idempotencyKey: UUID,
        @Param("title") title: String,
    ): Int

    @Query(
        nativeQuery = true,
        value = """
            SELECT *
            FROM note.chat
            WHERE user_id = :userId AND idempotency_key = :idempotencyKey
        """,
    )
    fun findByUserIdAndIdempotencyKey(
        @Param("userId") userId: UUID,
        @Param("idempotencyKey") idempotencyKey: UUID,
    ): ChatEntity?

    fun findByIdAndUserId(id: UUID, userId: UUID): ChatEntity?
    fun findByUserIdOrderByCreatedAtDesc(userId: UUID): List<ChatEntity>
}
