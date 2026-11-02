package io.uliss.note_service.repository

import io.uliss.note_service.model.ProfileRebuildStatus
import io.uliss.note_service.model.UserProfileRebuildEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
interface UserProfileRebuildRepository : JpaRepository<UserProfileRebuildEntity, UUID> {

    fun findByUserIdAndStatus(userId: UUID, status: ProfileRebuildStatus): UserProfileRebuildEntity?

    @Query("SELECT r.userId FROM UserProfileRebuildEntity r WHERE r.status = :status")
    fun findUserIdsByStatus(@Param("status") status: ProfileRebuildStatus): List<UUID>

    /** Serializes starting a rebuild of one user's profile: the check for a running one and the insert. */
    @Query(
        nativeQuery = true,
        value = """
            SELECT 1
            FROM (SELECT pg_advisory_xact_lock(hashtextextended('user-profile-rebuild:' || CAST(:userId AS text), 0))) l
        """,
    )
    fun lockUserRebuilds(@Param("userId") userId: UUID): Int
}
