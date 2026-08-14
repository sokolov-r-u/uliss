package io.uliss.user_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.user_service.anyValue
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.OnboardingMessageCode
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.model.UserMessageStatus
import io.uliss.user_service.onboarding.OnboardingCommand
import io.uliss.user_service.repository.UserRepository
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.mockito.invocation.InvocationOnMock
import java.util.Optional
import java.util.UUID
import kotlin.test.assertEquals
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
        Mockito.`when`(userRepository.findByAuthId(authId)).thenReturn(null)
        // save() returns the exact same entity instance it received - matches JpaRepository/CrudRepository semantics.
        Mockito.`when`(userRepository.save(anyValue())).thenAnswer { invocation: InvocationOnMock ->
            invocation.getArgument<UserEntity>(0)
        }
        val service = UserProfileService(userRepository, messageService, emptyList())

        val result = service.getOrCreate(authId)

        assertEquals(authId, result.authId)
        assertEquals(null, result.displayName)
        Mockito.verify(messageService).seedOnboarding(result.id)
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
        Mockito.`when`(userRepository.findById(userId)).thenReturn(Optional.empty())
        val service = UserProfileService(userRepository, messageService, listOf(command))

        assertFailsWith<NotFoundException> {
            service.submit(userId, OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "Bob", null, null))
        }
    }

    @Test
    fun `submit applies the command, saves the user and transitions the message`() {
        val userId = UUID.randomUUID()
        val user = UserEntity(authId = UUID.randomUUID(), displayName = null)
        val command = mockCommand(OnboardingMessageCode.SET_DISPLAY_NAME)
        val request = OnboardingRequest(OnboardingMessageCode.SET_DISPLAY_NAME, "Bob", null, null)
        Mockito.`when`(userRepository.findById(userId)).thenReturn(Optional.of(user))
        Mockito.`when`(command.apply(user, request)).thenReturn(UserMessageStatus.COMPLETED)
        val service = UserProfileService(userRepository, messageService, listOf(command))

        service.submit(userId, request)

        val inOrder = Mockito.inOrder(command, userRepository, messageService)
        inOrder.verify(command).apply(user, request)
        inOrder.verify(userRepository).save(user)
        inOrder.verify(messageService)
            .transition(userId, OnboardingMessageCode.SET_DISPLAY_NAME, UserMessageStatus.COMPLETED)
    }
}
