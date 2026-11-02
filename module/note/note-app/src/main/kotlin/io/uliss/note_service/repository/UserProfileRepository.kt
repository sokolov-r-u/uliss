package io.uliss.note_service.repository

import io.uliss.note_service.model.ProfileRebuildStatus
import io.uliss.note_service.model.UserProfileEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.UUID

@Repository
interface UserProfileRepository : JpaRepository<UserProfileEntity, UUID> {
    fun findByUserId(userId: UUID): UserProfileEntity?

    /** Profiles flagged by a deletion, with no rebuild running and none finished after [finishedAfter]. */
    @Query(
        """
        SELECT p.userId FROM UserProfileEntity p
        WHERE p.lastDeletionAt IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM UserProfileRebuildEntity r
                          WHERE r.userId = p.userId AND (r.status = :running OR r.finishedAt > :finishedAfter))
        """
    )
    fun findUserIdsDueForDeletionRebuild(
        @Param("finishedAfter") finishedAfter: Instant,
        @Param("running") running: ProfileRebuildStatus = ProfileRebuildStatus.RUNNING,
    ): List<UUID>
}
