package io.uliss.user_service.service

import io.uliss.user_service.anyValue
import io.uliss.user_service.captorFor
import io.uliss.user_service.captureValue
import io.uliss.user_service.dto.OnboardingMessageView
import io.uliss.user_service.model.MessageEntity
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import io.uliss.user_service.model.UserMessageStatus
import io.uliss.user_service.repository.MessageRepository
import io.uliss.user_service.repository.UserMessageRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class MessageServiceTest {

    private val messageRepository = Mockito.mock(MessageRepository::class.java)
    private val userMessageRepository = Mockito.mock(UserMessageRepository::class.java)
    private val messageService = MessageService(messageRepository, userMessageRepository)

    @Test
    fun `seedOnboarding creates a PENDING row for every catalog message`() {
        val userId = UUID.randomUUID()
        val displayNameMessage = MessageEntity(code = "SET_DISPLAY_NAME", blocking = true)
        val completeProfileMessage = MessageEntity(code = "COMPLETE_PROFILE", blocking = false)
        Mockito.`when`(messageRepository.findAll())
            .thenReturn(listOf(displayNameMessage, completeProfileMessage))

        messageService.seedOnboarding(userId)

        val captor = captorFor<Iterable<UserMessageEntity>>(Iterable::class.java)
        Mockito.verify(userMessageRepository).saveAll(captor.captureValue())
        val saved = captor.value.toList()
        assertEquals(2, saved.size)
        assertTrue(saved.all { it.status == UserMessageStatus.PENDING })
        assertTrue(saved.all { it.userMessageId.userId == userId })
        assertEquals(
            setOf(displayNameMessage.id, completeProfileMessage.id),
            saved.map { it.userMessageId.messageId }.toSet(),
        )
    }

    @Test
    fun `seedOnboarding with an empty catalog saves nothing`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(messageRepository.findAll()).thenReturn(emptyList())

        messageService.seedOnboarding(userId)

        Mockito.verify(userMessageRepository).saveAll(emptyList<UserMessageEntity>())
    }

    @Test
    fun `getPending delegates to the repository`() {
        val userId = UUID.randomUUID()
        val view = Mockito.mock(OnboardingMessageView::class.java)
        Mockito.`when`(userMessageRepository.findPendingByUserId(userId)).thenReturn(listOf(view))

        val result = messageService.getPending(userId)

        assertEquals(listOf(view), result)
    }

    @Test
    fun `transition is a no-op when the message code is not in the catalog`() {
        val userId = UUID.randomUUID()
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(null)

        messageService.transition(userId, OnboardingMessageCode.SET_DISPLAY_NAME, UserMessageStatus.COMPLETED)

        Mockito.verify(userMessageRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `transition is a no-op when no user-message row exists for the user`() {
        val userId = UUID.randomUUID()
        val message = MessageEntity(code = "SET_DISPLAY_NAME", blocking = true)
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(message)
        Mockito.`when`(userMessageRepository.findById(anyValue())).thenReturn(Optional.empty())

        messageService.transition(userId, OnboardingMessageCode.SET_DISPLAY_NAME, UserMessageStatus.COMPLETED)

        Mockito.verify(userMessageRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `transition is a no-op when the user-message row is no longer PENDING`() {
        val userId = UUID.randomUUID()
        val message = MessageEntity(code = "SET_DISPLAY_NAME", blocking = true)
        val userMessage = UserMessageEntity(UserMessageId(userId, message.id), status = UserMessageStatus.COMPLETED)
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(message)
        Mockito.`when`(userMessageRepository.findById(anyValue())).thenReturn(Optional.of(userMessage))

        messageService.transition(userId, OnboardingMessageCode.SET_DISPLAY_NAME, UserMessageStatus.SKIPPED)

        assertEquals(UserMessageStatus.COMPLETED, userMessage.status)
        Mockito.verify(userMessageRepository, Mockito.never()).save(anyValue())
    }

    @Test
    fun `transition updates and saves a PENDING user-message row`() {
        val userId = UUID.randomUUID()
        val message = MessageEntity(code = "SET_DISPLAY_NAME", blocking = true)
        val userMessage = UserMessageEntity(UserMessageId(userId, message.id))
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(message)
        Mockito.`when`(userMessageRepository.findById(anyValue())).thenReturn(Optional.of(userMessage))

        messageService.transition(userId, OnboardingMessageCode.SET_DISPLAY_NAME, UserMessageStatus.COMPLETED)

        assertEquals(UserMessageStatus.COMPLETED, userMessage.status)
        Mockito.verify(userMessageRepository).save(userMessage)
    }
}
