package io.uliss.user_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.user_service.anyValue
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.exception.OnboardingStepNotPendingException
import io.uliss.user_service.model.UserMessageEntity
import io.uliss.user_service.model.UserMessageId
import io.uliss.user_service.model.UserMessageStatus
import io.uliss.user_service.onboarding.OnboardingInput
import io.uliss.user_service.onboarding.OnboardingCommand
import io.uliss.user_service.repository.UserRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.Optional
import java.util.UUID
import kotlin.test.assertFailsWith
import kotlin.test.assertSame

class UserProfileServiceTest {

    private val userRepository = Mockito.mock(UserRepository::class.java)
    private val messageService = Mockito.mock(MessageService::class.java)

    private fun mockCommand(code: OnboardingMessageCode): OnboardingCommand {
        val command = Mockito.mock(OnboardingCommand::class.java)
        Mockito.`when`(command.code).thenReturn(code)
        return command
    }

    @Test
    fun `getOrCreate returns the existing profile without seeding onboarding again`() {
        val authId = UUID.randomUUID()
        val existing = UserEntity(authId = authId, displayName = "Alice")
        Mockito.`when`(userRepository.findByAuthId(authId)).thenReturn(existing)
        val service = UserProfileService(userRepository, messageService, emptyList())

        val result = service.getOrCreate(authId)

        assertSame(existing, result)
        Mockito.verify(userRepository, Mockito.never()).save(anyValue())
        Mockito.verify(messageService, Mockito.never()).seedOnboarding(anyValue())
    }

    @Test
    fun `getOrCreate creates and seeds a new profile when none exists`() {
        val authId = UUID.randomUUID()
        val created = UserEntity(authId = authId, displayName = null)
        Mockito.`when`(userRepository.findByAuthId(authId)).thenReturn(null, created)
        Mockito.`when`(userRepository.insertIfAbsent(anyValue(), anyValue())).thenReturn(1)
        val service = UserProfileService(userRepository, messageService, emptyList())

        val result = service.getOrCreate(authId)

        assertSame(created, result)
        Mockito.verify(messageService).seedOnboarding(created.id)
    }

    @Test
    fun `getOrCreate does not seed when a concurrent call inserted the profile`() {
        val authId = UUID.randomUUID()
        val concurrent = UserEntity(authId = authId, displayName = null)
        Mockito.`when`(userRepository.findByAuthId(authId)).thenReturn(null, concurrent)
        Mockito.`when`(userRepository.insertIfAbsent(anyValue(), anyValue())).thenReturn(0)
        val service = UserProfileService(userRepository, messageService, emptyList())

        val result = service.getOrCreate(authId)

        assertSame(concurrent, result)
        Mockito.verify(messageService, Mockito.never()).seedOnboarding(anyValue())
    }

    @Test
    fun `submit throws BadRequestException for a command with no registered handler`() {
        val service = UserProfileService(userRepository, messageService, emptyList())

        assertFailsWith<BadRequestException> {
            service.submit(
                UUID.randomUUID(),
                OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "Bob", null, null)
            )
        }
        Mockito.verify(userRepository, Mockito.never()).findById(anyValue())
    }

    @Test
    fun `submit throws NotFoundException when the user id does not exist`() {
        val userId = UUID.randomUUID()
        val command = mockCommand(OnboardingMessageCode.SET_DISPLAY_NAME)
        Mockito.`when`(messageService.getPendingStepForUpdate(userId, OnboardingMessageCode.SET_DISPLAY_NAME))
            .thenReturn(pendingStep(userId))
        Mockito.`when`(userRepository.findById(userId)).thenReturn(Optional.empty())
        val service = UserProfileService(userRepository, messageService, listOf(command))

        assertFailsWith<NotFoundException> {
            service.submit(userId, OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "Bob", null, null))
        }
    }

    @Test
    fun `submit locks the step before applying the command, then saves and finishes it`() {
        val userId = UUID.randomUUID()
        val user = UserEntity(authId = UUID.randomUUID(), displayName = null)
        val command = mockCommand(OnboardingMessageCode.SET_DISPLAY_NAME)
        val request = OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "Bob", null, null)
        val step = pendingStep(userId)
        Mockito.`when`(messageService.getPendingStepForUpdate(userId, OnboardingMessageCode.SET_DISPLAY_NAME))
            .thenReturn(step)
        Mockito.`when`(userRepository.findById(userId)).thenReturn(Optional.of(user))
        Mockito.`when`(command.apply(user, OnboardingInput("Bob", null, null))).thenReturn(UserMessageStatus.COMPLETED)
        val service = UserProfileService(userRepository, messageService, listOf(command))

        service.submit(userId, request)

        val inOrder = Mockito.inOrder(messageService, command, userRepository)
        inOrder.verify(messageService).getPendingStepForUpdate(userId, OnboardingMessageCode.SET_DISPLAY_NAME)
        inOrder.verify(command).apply(user, OnboardingInput("Bob", null, null))
        inOrder.verify(userRepository).save(user)
        inOrder.verify(messageService).finish(step, UserMessageStatus.COMPLETED)
    }

    @Test
    fun `submit of a step that is not pending changes nothing`() {
        val userId = UUID.randomUUID()
        val command = mockCommand(OnboardingMessageCode.SET_DISPLAY_NAME)
        Mockito.`when`(messageService.getPendingStepForUpdate(userId, OnboardingMessageCode.SET_DISPLAY_NAME))
            .thenThrow(OnboardingStepNotPendingException(OnboardingMessageCode.SET_DISPLAY_NAME))
        val service = UserProfileService(userRepository, messageService, listOf(command))

        assertFailsWith<OnboardingStepNotPendingException> {
            service.submit(userId, OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "Bob", null, null))
        }
        Mockito.verify(command, Mockito.never()).apply(anyValue(), anyValue())
        Mockito.verify(userRepository, Mockito.never()).save(anyValue())
    }

    private fun pendingStep(userId: UUID) = UserMessageEntity(UserMessageId(userId, UUID.randomUUID()))
}
