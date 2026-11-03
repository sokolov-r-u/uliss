package io.uliss.note_service.service.handler

import io.uliss.logging.logger.AppLogger
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
        // no notes left: a running rebuild has read them all
        val batch = profileService.findBatch(payload.userId) ?: return profileService.finishRebuild(payload.userId)
        val written = if (batch.profile == null) {
            write(UserProfilePrompts.INITIAL_SYSTEM_PROMPT, UserProfilePrompts.notesUserPrompt(batch.notes))
        } else {
            write(UserProfilePrompts.UPDATE_SYSTEM_PROMPT, UserProfilePrompts.updateUserPrompt(batch.profile, batch.notes))
        }
        val content = if (written.length > properties.maxChars) {
            write(
                UserProfilePrompts.COMPACT_SYSTEM_PROMPT,
                UserProfilePrompts.compactUserPrompt(written, properties.compactTargetChars),
            ).also { compacted ->
                if (compacted.length > properties.maxChars) {
                    log.warn(
                        "profile of user=${payload.userId} is still ${compacted.length} chars after compacting " +
                            "(limit ${properties.maxChars}); saving it as is",
                        "handle",
                    )
                }
            }
        } else {
            written
        }
        profileService.save(payload.userId, batch, content)
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
