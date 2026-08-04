package io.uliss.user_service.repository

import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import org.springframework.data.jpa.repository.JpaRepository
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
        order by m.blocking desc
    """, nativeQuery = true
    )
    fun findPendingByUserId(userId: UUID): List<OnboardingMessageView>
}
