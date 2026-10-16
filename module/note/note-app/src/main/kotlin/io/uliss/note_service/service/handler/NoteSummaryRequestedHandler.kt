package io.uliss.note_service.service.handler

import io.uliss.exception.common.NotFoundException
import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.NoteDraft
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxHandler
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.util.ChatPrompts
import io.uliss.note_service.util.SummaryRetrievalQuery
import io.uliss.note_service.util.TitleNormalizer
import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Min
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import org.springframework.validation.annotation.Validated
import tools.jackson.databind.ObjectMapper

@Validated
@ConfigurationProperties("note.summary")
data class NoteSummaryProperties(
    @field:Min(1)
    val retrievalQueryMaxChars: Int = 8_000,
    @field:Min(1)
    val retrievalTopK: Int = 5,
    @field:DecimalMin("0.0")
    @field:DecimalMax("1.0")
    val retrievalMinSimilarity: Double = 0.50,
    /** OpenAI per-call options for the summary call; passed to the provider as-is. */
    val reasoningEffort: String = "medium",
    val verbosity: String = "low",
)

@Component
class NoteSummaryRequestedHandler(
    private val objectMapper: ObjectMapper,
    private val chatClient: ChatClient,
    private val chatService: ChatService,
    private val ragService: RagService,
    private val noteService: NoteService,
    private val terminalFailureHandler: NoteSummaryTerminalFailureHandler,
    private val properties: NoteSummaryProperties,
) : OutboxHandler {

    private val log = AppLogger.of(NoteSummaryRequestedHandler::class)

    override val type: OutboxEventType = OutboxEventType.NOTE_SUMMARY_REQUESTED

    override fun handle(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteSummaryRequestedPayload::class.java)
        val context = try {
            chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId)
        } catch (_: NotFoundException) {
            // The chat was deleted after the request; retrying cannot succeed.
            log.warn("chat id=${payload.chatId} not found, failing summary note id=${payload.noteId}", "handle")
            terminalFailureHandler.handleTerminalFailure(event)
            return
        }
        val relatedChunks = ragService.search(
            userId = payload.userId,
            query = SummaryRetrievalQuery.build(context, properties.retrievalQueryMaxChars),
            limit = properties.retrievalTopK,
            minSimilarity = properties.retrievalMinSimilarity,
        )
        val draft: NoteDraft? = chatClient.prompt()
            .system(ChatPrompts.NOTE_SUMMARY_SYSTEM_PROMPT)
            .user(ChatPrompts.noteSummaryUserPrompt(context, relatedChunks))
            .options(
                OpenAiChatOptions.builder()
                    .reasoningEffort(properties.reasoningEffort)
                    .verbosity(properties.verbosity)
            )
            .call()
            .entity(NoteDraft::class.java) { it.useProviderStructuredOutput() }
        val content = checkNotNull(draft) { "summary model returned no draft" }.toNoteContent()
        val title = TitleNormalizer.normalizeNoteTitle(draft.title, content)
        noteService.completeChatSummary(payload.userId, payload.noteId, title, content)
    }
}
