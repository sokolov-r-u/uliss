package io.uliss.user_service.service

import io.uliss.database.utils.generateId
import io.uliss.exception.common.BadRequestException
import io.uliss.exception.common.InternalException
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

    /** Race-free: concurrent first logins insert one row, and only the inserting call seeds onboarding. */
    @Transactional
    fun getOrCreate(authId: UUID): UserEntity {
        userRepository.findByAuthId(authId)?.let { return it }

        val inserted = userRepository.insertIfAbsent(generateId(), authId) == 1
        val user = userRepository.findByAuthId(authId)
            ?: throw InternalException("user authId=$authId missing after insert")
        if (inserted) {
            messageService.seedOnboarding(user.id)
        }
        return user
    }

    @Transactional
    fun submit(userId: UUID, request: OnboardingRequest) {
        val command = commands[request.command]
            ?: throw BadRequestException("unknown onboarding command=${request.command}")
        // locked first: a concurrent submit of the same step waits here and then finds it no longer pending
        val step = messageService.getPendingStepForUpdate(userId, request.command)
        val user = userRepository.findById(userId)
            .orElseThrow { NotFoundException("user id=$userId not found") }

        val status = command.apply(user, request.toInput())
        userRepository.save(user)
        messageService.finish(step, status)
    }
}
