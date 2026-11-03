package io.uliss.note_service.service.handler

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxTerminalFailureHandler
import io.uliss.note_service.repository.UserProfileRepository
import io.uliss.note_service.service.UserProfileService
import org.springframework.context.annotation.Lazy
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/**
 * A failed refresh leaves the profile and its mark as they were; the batch is then halved, or skipped when it is one
 * note, so a batch the model always fails on cannot stop the profile. The log names where the profile stopped.
 */
@Component
class UserProfileRefreshTerminalFailureHandler(
    private val objectMapper: ObjectMapper,
    private val profileRepository: UserProfileRepository,
    // Lazy: OutboxService takes the terminal failure handlers, and the profile service publishes through it.
    @Lazy private val profileService: UserProfileService,
) : OutboxTerminalFailureHandler {

    private val log = AppLogger.of(UserProfileRefreshTerminalFailureHandler::class)

    override val type: OutboxEventType = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED

    override fun handleTerminalFailure(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, UserProfileRefreshRequestedPayload::class.java)
        val mark = profileRepository.findByUserId(payload.userId)?.notesThrough
        log.error(
            "profile refresh of user=${payload.userId} failed for good after attempts=${event.attempts}; " +
                "batch after mark=${mark ?: "none (no profile yet)"}: ${event.lastError}",
            "handleTerminalFailure",
        )
        profileService.handleFailedBatch(payload.userId)
    }
}
