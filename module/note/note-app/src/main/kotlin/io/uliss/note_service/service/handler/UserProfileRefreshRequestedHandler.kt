package io.uliss.note_service.service.handler

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.UserProfileInput
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.UserProfileRefreshRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxHandler
import io.uliss.note_service.service.UserProfileProperties
import io.uliss.note_service.service.UserProfileService
import io.uliss.note_service.util.UserProfilePrompts
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/** Reads the user's next batch of notes into their profile: one model call per batch. */
@Component
class UserProfileRefreshRequestedHandler(
    private val objectMapper: ObjectMapper,
    private val chatClient: ChatClient,
    private val profileService: UserProfileService,
    private val properties: UserProfileProperties,
) : OutboxHandler {

    private val log = AppLogger.of(UserProfileRefreshRequestedHandler::class)

    override val type: OutboxEventType = OutboxEventType.USER_PROFILE_REFRESH_REQUESTED

    override fun handle(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, UserProfileRefreshRequestedPayload::class.java)
        val batch = profileService.findBatch(payload.userId)
        if (batch == null) {
            // no notes left: a profile behind the rules is brought in line with them, a running rebuild has read all
            val work = profileService.findRulesWork(payload.userId) ?: return profileService.finishRebuild(payload.userId)
            val written = write(
                UserProfilePrompts.CONFORM_SYSTEM_PROMPT,
                UserProfilePrompts.conformUserPrompt(work.profile, work.input),
            )
            return profileService.saveConformed(payload.userId, work, compactIfLong(payload.userId, written, work.input))
        }
        val written = if (batch.profile == null) {
            write(UserProfilePrompts.INITIAL_SYSTEM_PROMPT, UserProfilePrompts.notesUserPrompt(batch.notes, batch.input))
        } else {
            write(
                UserProfilePrompts.UPDATE_SYSTEM_PROMPT,
                UserProfilePrompts.updateUserPrompt(batch.profile, batch.notes, batch.input),
            )
        }
        profileService.save(payload.userId, batch, compactIfLong(payload.userId, written, batch.input))
    }

    private fun compactIfLong(userId: UUID, written: String, input: UserProfileInput): String {
        if (written.length <= properties.maxChars) return written
        return write(
            UserProfilePrompts.COMPACT_SYSTEM_PROMPT,
            UserProfilePrompts.compactUserPrompt(written, properties.compactTargetChars, input),
        ).also { compacted ->
            if (compacted.length > properties.maxChars) {
                log.warn(
                    "profile of user=$userId is still ${compacted.length} chars after compacting " +
                        "(limit ${properties.maxChars}); saving it as is",
                    "handle",
                )
            }
        }
    }

    private fun write(system: String, user: String): String =
        chatClient.prompt()
            .system(system)
            .user(user)
            .options(
                OpenAiChatOptions.builder()
                    .reasoningEffort(properties.reasoningEffort)
                    .verbosity(properties.verbosity)
            )
            .call()
            .content()
            .let { checkNotNull(it?.takeIf(String::isNotBlank)) { "profile model returned no text" } }
}
