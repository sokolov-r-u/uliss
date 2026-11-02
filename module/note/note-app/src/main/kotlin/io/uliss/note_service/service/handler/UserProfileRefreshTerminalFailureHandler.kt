package io.uliss.note_service.service.handler

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxTerminalFailureHandler
import io.uliss.note_service.repository.UserProfileRepository
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/**
 * Nothing to undo: a failed refresh leaves the profile and its mark as they were, and the next run reads the same
 * batch again. The log names where the profile stopped, so a batch that always fails can be found.
 */
@Component
class UserProfileRefreshTerminalFailureHandler(
    private val objectMapper: ObjectMapper,
    private val profileRepository: UserProfileRepository,
) : OutboxTerminalFailureHandler {

    private val log = AppLogger.of(UserProfileRefreshTerminalFailureHandler::class)

    override val type: OutboxEventType = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED

    override fun handleTerminalFailure(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, UserProfileRefreshRequestedPayload::class.java)
        val mark = profileRepository.findByUserId(payload.userId)?.notesThrough
        log.error(
            "profile refresh of user=${payload.userId} failed for good after attempts=${event.attempts}; " +
                "notes after mark=${mark ?: "none (no profile yet)"} stay unread: ${event.lastError}",
            "handleTerminalFailure",
        )
    }
}
