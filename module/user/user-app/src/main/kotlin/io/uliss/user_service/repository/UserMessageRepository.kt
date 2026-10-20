package io.uliss.user_service.repository

import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import java.util.UUID

interface UserMessageRepository : JpaRepository<UserMessageEntity, UserMessageId> {

    @Query(
        """
        select m.code as code, m.blocking as blocking, um.status as status
        from profile.user_message as um
        join profile.messages as m on um.message_id = m.id
        where um.user_id = :userId
        and um.status = 'PENDING'
        order by m.blocking desc, m.code
    """, nativeQuery = true
    )
    fun findPendingByUserId(userId: UUID): List<OnboardingMessageView>

    @Query(
        """
        select exists (
            select 1
            from profile.user_message as um
            join profile.messages as m on um.message_id = m.id
            where um.user_id = :userId
            and um.status = 'PENDING'
            and m.blocking
        )
    """, nativeQuery = true
    )
    fun existsPendingBlockingByUserId(userId: UUID): Boolean

    /** Locks the user's step until the transaction ends, so a double submit applies once. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select um from UserMessageEntity um where um.userMessageId = :id")
    fun findForUpdate(id: UserMessageId): UserMessageEntity?
}
