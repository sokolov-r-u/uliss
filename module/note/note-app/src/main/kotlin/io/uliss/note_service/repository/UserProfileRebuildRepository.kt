package io.uliss.note_service.repository

import io.uliss.note_service.model.ProfileRebuildStatus
import io.uliss.note_service.model.ProfileRebuildTrigger
import io.uliss.note_service.model.UserProfileRebuildEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.UUID

@Repository
interface UserProfileRebuildRepository : JpaRepository<UserProfileRebuildEntity, UUID> {

    fun findByUserIdAndStatus(userId: UUID, status: ProfileRebuildStatus): UserProfileRebuildEntity?

    @Query("SELECT r.userId FROM UserProfileRebuildEntity r WHERE r.status = :status")
    fun findUserIdsByStatus(@Param("status") status: ProfileRebuildStatus): List<UUID>

    /** When the user's rebuilds of [trigger] started after [after], oldest first. */
    @Query(
        """
        SELECT r.createdAt FROM UserProfileRebuildEntity r
        WHERE r.userId = :userId AND r.trigger = :trigger AND r.createdAt > :after
        ORDER BY r.createdAt
        """
    )
    fun findStartsAfter(
        @Param("userId") userId: UUID,
        @Param("trigger") trigger: ProfileRebuildTrigger,
        @Param("after") after: Instant,
    ): List<Instant>

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
