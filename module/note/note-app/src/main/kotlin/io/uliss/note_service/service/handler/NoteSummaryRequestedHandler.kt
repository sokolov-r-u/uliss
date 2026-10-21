package io.uliss.note_service.service.handler

import io.uliss.exception.common.NotFoundException
import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.NoteDraft
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxHandler
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.util.ChatPrompts
import io.uliss.note_service.util.SummaryRetrievalQuery
import io.uliss.note_service.util.TitleNormalizer
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class NoteSummaryRequestedHandler(
    private val objectMapper: ObjectMapper,
    private val chatClient: ChatClient,
    private val chatService: ChatService,
    private val ragService: RagService,
    private val noteSummaryService: NoteSummaryService,
    private val properties: NoteSummaryProperties,
) : OutboxHandler {

    private val log = AppLogger.of(NoteSummaryRequestedHandler::class)

    override val type: OutboxEventType = OutboxEventType.NOTE_SUMMARY_REQUESTED

    override fun handle(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteSummaryRequestedPayload::class.java)
        if (!noteSummaryService.isAwaitingSummary(payload.userId, payload.noteId)) {
            // deleted or finished while the event waited: a model call would be paid for nothing
            log.warn("note id=${payload.noteId} no longer waits for its summary, skipping", "handle")
            return
        }
        val context = try {
            chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId)
        } catch (_: NotFoundException) {
            throw NonRetryableOutboxException("chat id=${payload.chatId} was deleted before note id=${payload.noteId}")
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
        noteSummaryService.completeChatSummary(payload.userId, payload.noteId, title, content)
    }
}
