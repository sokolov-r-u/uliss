package io.uliss.user_service.service

import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.NotFoundException
import io.uliss.user_service.dto.OnboardingRequest
import io.uliss.user_service.model.UserEntity
import io.uliss.user_service.onboarding.OnboardingCommand
import io.uliss.user_service.repository.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class UserProfileService(
    private val userRepository: UserRepository,
    private val messageService: MessageService,
    commands: List<OnboardingCommand>,
) {

    private val commands = commands.associateBy { it.code }

    @Transactional
    fun getOrCreate(authId: UUID): UserEntity =
        userRepository.findByAuthId(authId) ?: create(authId)

    @Transactional
    fun submit(userId: UUID, request: OnboardingRequest) {
        val command = commands[request.command]
            ?: throw BadRequestException("unknown onboarding command=${request.command}")
        val user = userRepository.findById(userId)
            .orElseThrow { NotFoundException("user id=$userId not found") }

        val status = command.apply(user, request)
        userRepository.save(user)
        messageService.transition(userId, request.command, status)
    }

    private fun create(authId: UUID): UserEntity {
        val user = userRepository.save(UserEntity(authId = authId, displayName = null))
        messageService.seedOnboarding(user.id)
        return user
    }
}
