package io.uliss.user_service.service

import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import io.uliss.user_service.model.UserMessageStatus
import io.uliss.user_service.repository.MessageRepository
import io.uliss.user_service.repository.UserMessageRepository
import io.uliss.exception.common.InternalException
import io.uliss.user_service.exception.OnboardingStepNotPendingException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
@Transactional(readOnly = true)
class MessageService(
    private val messageRepository: MessageRepository,
    private val userMessageRepository: UserMessageRepository,
) {

    @Transactional
    fun seedOnboarding(userId: UUID) {
        val userMessages = messageRepository.findAll()
            .map { UserMessageEntity(UserMessageId(userId, it.id)) }
        userMessageRepository.saveAll(userMessages)
    }

    fun getPending(userId: UUID): List<OnboardingMessageView> =
        userMessageRepository.findPendingByUserId(userId)

    /** Whether a blocking onboarding step is still pending; services refuse the user's requests until it is not. */
    fun isOnboardingRequired(userId: UUID): Boolean =
        userMessageRepository.existsPendingBlockingByUserId(userId)

    /**
     * The user's pending step, locked until the transaction ends. A step already completed or skipped, or never seeded
     * for this user (users created before the step existed, `docs/TECH_DEBT.md`), is not pending.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    fun getPendingStepForUpdate(userId: UUID, code: OnboardingMessageCode): UserMessageEntity {
        val message = messageRepository.findByCode(code.name)
            ?: throw InternalException("onboarding message $code is missing from the catalog")
        return userMessageRepository.findForUpdate(UserMessageId(userId, message.id))
            ?.takeIf { it.status == UserMessageStatus.PENDING }
            ?: throw OnboardingStepNotPendingException(code)
    }

    @Transactional
    fun finish(step: UserMessageEntity, status: UserMessageStatus) {
        step.status = status
        userMessageRepository.save(step)
    }
}
