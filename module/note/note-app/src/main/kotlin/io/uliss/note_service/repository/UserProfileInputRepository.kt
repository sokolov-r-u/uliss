package io.uliss.note_service.repository

import io.uliss.note_service.model.UserProfileInputEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface UserProfileInputRepository : JpaRepository<UserProfileInputEntity, UUID> {
    fun findByUserId(userId: UUID): UserProfileInputEntity?

    /** Serializes saves of one user's input: two first saves would both insert the row. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT 1
            FROM (SELECT pg_advisory_xact_lock(hashtextextended('user-profile-input:' || CAST(:userId AS text), 0))) l
        """,
    )
    fun lockUserInput(@Param("userId") userId: UUID): Int
}
