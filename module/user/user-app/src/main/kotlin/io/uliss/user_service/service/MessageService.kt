package io.uliss.user_service.service

import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import io.uliss.user_service.model.UserMessageStatus
import io.uliss.user_service.repository.MessageRepository
import io.uliss.user_service.repository.UserMessageRepository
import org.springframework.stereotype.Service
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

    @Transactional
    fun transition(userId: UUID, code: OnboardingMessageCode, status: UserMessageStatus) {
        val message = messageRepository.findByCode(code.name) ?: return
        val userMessage = userMessageRepository.findById(UserMessageId(userId, message.id)).orElse(null) ?: return
        if (userMessage.status == UserMessageStatus.PENDING) {
            userMessage.status = status
            userMessageRepository.save(userMessage)
        }
    }

//    todo add registration new messages to all existing users
}
