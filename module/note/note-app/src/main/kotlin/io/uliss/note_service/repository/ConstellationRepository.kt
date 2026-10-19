package io.uliss.note_service.repository

import io.uliss.note_service.model.ConstellationEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
interface ConstellationRepository : JpaRepository<ConstellationEntity, UUID> {

    fun findByUserIdOrderByCreatedAtAscIdAsc(userId: UUID): List<ConstellationEntity>

    fun existsByIdAndUserId(id: UUID, userId: UUID): Boolean

    /**
     * Serializes structural changes of one user's tree until the transaction ends: two moves checked
     * separately could otherwise close a cycle together.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    @Query(
        nativeQuery = true,
        value = """
            SELECT 1
            FROM (SELECT pg_advisory_xact_lock(hashtextextended('constellations:' || CAST(:userId AS text), 0))) l
        """,
    )
    fun lockUserTree(@Param("userId") userId: UUID): Int

    /** Deletes the owned constellation with all its sub-constellations; returns the number of deleted rows. */
    @Modifying
    @Query(
        nativeQuery = true,
        value = """
            WITH RECURSIVE branch AS (
                SELECT id
                FROM note.constellations
                WHERE id = :id AND user_id = :userId
                UNION ALL
                SELECT c.id
                FROM note.constellations c
                         JOIN branch b ON c.parent_id = b.id
                WHERE c.user_id = :userId
            )
            DELETE FROM note.constellations
            WHERE id IN (SELECT id FROM branch)
        """,
    )
    fun deleteBranch(@Param("userId") userId: UUID, @Param("id") id: UUID): Int
}
