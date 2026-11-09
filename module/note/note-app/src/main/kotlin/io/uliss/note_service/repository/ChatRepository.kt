package io.uliss.note_service.repository

import io.uliss.note_service.model.ChatEntity
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.CrudRepository
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
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
    /** The user's unpinned chats by last activity, newest first; pinned ones come from [findPinned]. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT *
            FROM note.chat
            WHERE user_id = :userId AND pinned_at IS NULL
            ORDER BY updated_at DESC, id DESC
            LIMIT :limit
        """,
    )
    fun findPage(@Param("userId") userId: UUID, @Param("limit") limit: Int): List<ChatEntity>

    /** The user's chats strictly after the keyset position `(updatedAt, id)` in [findPage] order. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT *
            FROM note.chat
            WHERE user_id = :userId AND pinned_at IS NULL
              AND (updated_at, id) < (:updatedAt, :id)
            ORDER BY updated_at DESC, id DESC
            LIMIT :limit
        """,
    )
    fun findPageAfter(
        @Param("userId") userId: UUID,
        @Param("updatedAt") updatedAt: Instant,
        @Param("id") id: UUID,
        @Param("limit") limit: Int,
    ): List<ChatEntity>

    fun findByUserIdAndIdInOrderByUpdatedAtDescIdDesc(userId: UUID, ids: Collection<UUID>): List<ChatEntity>

    /** Marks new chat activity, which lifts the chat in chat lists; the version is left alone for concurrent JPA writes. */
    @Modifying
    @Query(
        nativeQuery = true,
        value = """
            UPDATE note.chat
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id = :id AND user_id = :userId
        """,
    )
    fun touchActivity(@Param("id") id: UUID, @Param("userId") userId: UUID): Int

    /**
     * Replaces the owned chat's first-message title with a generated one; 0 when the chat is missing, not theirs, or
     * already titled by the model or the user. Leaves `updated_at` and `version` alone, so a concurrent rename wins.
     */
    @Modifying(clearAutomatically = true)
    @Query(
        nativeQuery = true,
        value = """
            UPDATE note.chat
            SET title = :title, title_source = 'GENERATED'
            WHERE id = :id AND user_id = :userId AND title_source = 'FIRST_MESSAGE'
        """,
    )
    fun applyGeneratedTitle(@Param("id") id: UUID, @Param("userId") userId: UUID, @Param("title") title: String): Int

    /** Serializes one user's chat pins until the transaction ends, so two pins checked apart cannot pass the limit. */
    @Transactional(propagation = Propagation.MANDATORY)
    @Query(
        nativeQuery = true,
        value = """
            SELECT 1
            FROM (SELECT pg_advisory_xact_lock(hashtextextended('pins:chat:' || CAST(:userId AS text), 0))) l
        """,
    )
    fun lockPins(@Param("userId") userId: UUID): Int

    /**
     * Pins the owned, unpinned chat while the user has fewer than [limit] pinned; 0 when it is pinned already, not
     * theirs, or the limit is reached. Leaves `updated_at` and `version` alone.
     */
    @Modifying(clearAutomatically = true)
    @Query(
        nativeQuery = true,
        value = """
            UPDATE note.chat
            SET pinned_at = CURRENT_TIMESTAMP
            WHERE id = :id AND user_id = :userId AND pinned_at IS NULL
              AND (SELECT count(*) FROM note.chat WHERE user_id = :userId AND pinned_at IS NOT NULL) < :limit
        """,
    )
    fun pin(@Param("id") id: UUID, @Param("userId") userId: UUID, @Param("limit") limit: Int): Int

    /** Unpins the owned chat; leaves `updated_at` and `version` alone. */
    @Modifying(clearAutomatically = true)
    @Query(
        nativeQuery = true,
        value = """
            UPDATE note.chat
            SET pinned_at = NULL
            WHERE id = :id AND user_id = :userId
        """,
    )
    fun unpin(@Param("id") id: UUID, @Param("userId") userId: UUID): Int

    /** The user's pinned chats, last pinned first. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT *
            FROM note.chat
            WHERE user_id = :userId AND pinned_at IS NOT NULL
            ORDER BY pinned_at DESC, id DESC
            LIMIT :limit
        """,
    )
    fun findPinned(@Param("userId") userId: UUID, @Param("limit") limit: Int): List<ChatEntity>
}
