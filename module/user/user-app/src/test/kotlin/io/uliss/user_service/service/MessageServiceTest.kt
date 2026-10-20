package io.uliss.user_service.service

import io.uliss.exception.common.InternalException
import io.uliss.user_service.anyValue
import io.uliss.user_service.captorFor
import io.uliss.user_service.captureValue
import io.uliss.user_service.exception.OnboardingStepNotPendingException
import io.uliss.user_service.model.MessageEntity
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import io.uliss.user_service.model.UserMessageStatus
import io.uliss.user_service.repository.MessageRepository
import io.uliss.user_service.repository.UserMessageRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertSame
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
    fun `a step missing from the catalog is a server error`() {
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(null)

        assertFailsWith<InternalException> {
            messageService.getPendingStepForUpdate(UUID.randomUUID(), OnboardingMessageCode.SET_DISPLAY_NAME)
        }
    }

    @Test
    fun `a step never seeded for the user is not pending`() {
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(MessageEntity("SET_DISPLAY_NAME", true))
        Mockito.`when`(userMessageRepository.findForUpdate(anyValue())).thenReturn(null)

        assertFailsWith<OnboardingStepNotPendingException> {
            messageService.getPendingStepForUpdate(UUID.randomUUID(), OnboardingMessageCode.SET_DISPLAY_NAME)
        }
    }

    @Test
    fun `a completed or skipped step is not pending`() {
        val userId = UUID.randomUUID()
        val message = MessageEntity("SET_DISPLAY_NAME", true)
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(message)
        listOf(UserMessageStatus.COMPLETED, UserMessageStatus.SKIPPED).forEach { status ->
            Mockito.`when`(userMessageRepository.findForUpdate(UserMessageId(userId, message.id)))
                .thenReturn(UserMessageEntity(UserMessageId(userId, message.id), status))

            assertFailsWith<OnboardingStepNotPendingException>(status.name) {
                messageService.getPendingStepForUpdate(userId, OnboardingMessageCode.SET_DISPLAY_NAME)
            }
        }
    }

    @Test
    fun `a pending step is returned locked for the caller to finish`() {
        val userId = UUID.randomUUID()
        val message = MessageEntity("SET_DISPLAY_NAME", true)
        val step = UserMessageEntity(UserMessageId(userId, message.id))
        Mockito.`when`(messageRepository.findByCode("SET_DISPLAY_NAME")).thenReturn(message)
        Mockito.`when`(userMessageRepository.findForUpdate(UserMessageId(userId, message.id))).thenReturn(step)

        assertSame(step, messageService.getPendingStepForUpdate(userId, OnboardingMessageCode.SET_DISPLAY_NAME))
    }
}
