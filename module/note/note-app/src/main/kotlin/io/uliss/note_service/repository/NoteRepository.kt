package io.uliss.note_service.repository

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.NoteStatusRow
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
interface NoteRepository : JpaRepository<NoteEntity, UUID> {
    fun findByIdAndUserId(id: UUID, userId: UUID): NoteEntity?

    /** Status polls run every second per open stream: they read three columns, never the content. */
    @Query(
        "select new io.uliss.note_service.model.projection.NoteStatusRow(n.id, n.status, n.updatedAt) " +
            "from NoteEntity n where n.id = :id and n.userId = :userId"
    )
    fun findStatusByIdAndUserId(@Param("id") id: UUID, @Param("userId") userId: UUID): NoteStatusRow?

    /**
     * The user's notes that belong to the constellation itself (not to its sub-constellations) with all their
     * sub-notes, newest first; a sub-note names its parent, so the caller can nest them.
     */
    @Query(
        nativeQuery = true,
        value = """
            WITH RECURSIVE here AS (
                SELECT nc.note_id AS id
                FROM note.note_constellation nc
                WHERE nc.constellation_id = :constellationId
                  AND nc.user_id = :userId
                UNION
                SELECT n.id
                FROM here h
                         JOIN note.notes n ON n.parent_note_id = h.id
                WHERE n.user_id = :userId
            )
            SELECT n.*
            FROM note.notes n
                     JOIN here h ON h.id = n.id
            WHERE n.user_id = :userId
            ORDER BY n.created_at DESC, n.id DESC
        """,
    )
    fun findInConstellation(
        @Param("userId") userId: UUID,
        @Param("constellationId") constellationId: UUID,
    ): List<NoteEntity>

    /** The user's top notes with no constellation, with all their sub-notes, newest first. */
    @Query(
        nativeQuery = true,
        value = """
            WITH RECURSIVE loose AS (
                SELECT n.id
                FROM note.notes n
                WHERE n.user_id = :userId
                  AND n.parent_note_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM note.note_constellation nc WHERE nc.note_id = n.id)
                UNION
                SELECT n.id
                FROM loose l
                         JOIN note.notes n ON n.parent_note_id = l.id
                WHERE n.user_id = :userId
            )
            SELECT n.*
            FROM note.notes n
                     JOIN loose l ON l.id = n.id
            WHERE n.user_id = :userId
            ORDER BY n.created_at DESC, n.id DESC
        """,
    )
    fun findWithoutConstellation(@Param("userId") userId: UUID): List<NoteEntity>

    /** The note's direct sub-notes, newest first. */
    fun findByUserIdAndParentNoteIdOrderByCreatedAtDescIdDesc(userId: UUID, parentNoteId: UUID): List<NoteEntity>

    /** The ids among [ids] of the user's notes in [status]. */
    @Query("select n.id from NoteEntity n where n.userId = :userId and n.status = :status and n.id in :ids")
    fun findIdsByStatus(
        @Param("userId") userId: UUID,
        @Param("status") status: NoteStatus,
        @Param("ids") ids: Collection<UUID>,
    ): List<UUID>

    /** Serializes one user's note pins until the transaction ends, so two pins checked apart cannot pass the limit. */
    @Transactional(propagation = Propagation.MANDATORY)
    @Query(
        nativeQuery = true,
        value = """
            SELECT 1
            FROM (SELECT pg_advisory_xact_lock(hashtextextended('pins:note:' || CAST(:userId AS text), 0))) l
        """,
    )
    fun lockPins(@Param("userId") userId: UUID): Int

    /**
     * Pins the owned, unpinned note while the user has fewer than [limit] pinned; 0 when it is pinned already, not
     * theirs, or the limit is reached. Leaves `updated_at` and `version` alone.
     */
    @Modifying(clearAutomatically = true)
    @Query(
        nativeQuery = true,
        value = """
            UPDATE note.notes
            SET pinned_at = CURRENT_TIMESTAMP
            WHERE id = :id AND user_id = :userId AND pinned_at IS NULL
              AND (SELECT count(*) FROM note.notes WHERE user_id = :userId AND pinned_at IS NOT NULL) < :limit
        """,
    )
    fun pin(@Param("id") id: UUID, @Param("userId") userId: UUID, @Param("limit") limit: Int): Int

    /** Unpins the owned note; leaves `updated_at` and `version` alone. */
    @Modifying(clearAutomatically = true)
    @Query(
        nativeQuery = true,
        value = """
            UPDATE note.notes
            SET pinned_at = NULL
            WHERE id = :id AND user_id = :userId
        """,
    )
    fun unpin(@Param("id") id: UUID, @Param("userId") userId: UUID): Int

    /** The user's pinned notes, last pinned first. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT *
            FROM note.notes
            WHERE user_id = :userId AND pinned_at IS NOT NULL
            ORDER BY pinned_at DESC, id DESC
            LIMIT :limit
        """,
    )
    fun findPinned(@Param("userId") userId: UUID, @Param("limit") limit: Int): List<NoteEntity>

    /** Inserts a READY manual note unless the user already created one under [idempotencyKey]; returns rows inserted. */
    @Modifying
    @Query(
        nativeQuery = true,
        value = """
            INSERT INTO note.notes (id, user_id, idempotency_key, request_fingerprint, source, status, title, content,
                                    icon, created_at, updated_at, version, created_by, updated_by)
            VALUES (:id, :userId, :idempotencyKey, :fingerprint, 'MANUAL', 'READY', :title, :content, :icon,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, CAST(:userId AS VARCHAR), CAST(:userId AS VARCHAR))
            ON CONFLICT (user_id, idempotency_key) DO NOTHING
        """,
    )
    fun insertManualNoteOnConflictDoNothing(
        @Param("id") id: UUID,
        @Param("userId") userId: UUID,
        @Param("idempotencyKey") idempotencyKey: UUID,
        @Param("fingerprint") fingerprint: ByteArray,
        @Param("title") title: String,
        @Param("content") content: String,
        @Param("icon") icon: String?,
    ): Int

    @Query(
        nativeQuery = true,
        value = "SELECT * FROM note.notes WHERE user_id = :userId AND idempotency_key = :idempotencyKey",
    )
    fun findByUserIdAndIdempotencyKey(
        @Param("userId") userId: UUID,
        @Param("idempotencyKey") idempotencyKey: UUID,
    ): NoteEntity?
}
