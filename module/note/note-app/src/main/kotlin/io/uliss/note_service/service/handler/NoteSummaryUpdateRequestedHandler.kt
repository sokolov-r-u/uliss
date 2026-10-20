package io.uliss.note_service.service.handler

import io.uliss.exception.common.NotFoundException
import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.NoteAddendumDraft
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryUpdateRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxHandler
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.util.ChatPrompts
import io.uliss.note_service.util.SummaryRetrievalQuery
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.LocalDate

@Component
class NoteSummaryUpdateRequestedHandler(
    private val objectMapper: ObjectMapper,
    private val chatClient: ChatClient,
    private val chatService: ChatService,
    private val ragService: RagService,
    private val noteService: NoteService,
    private val properties: NoteSummaryProperties,
    /** Addendum dates are UTC; tests pass a fixed clock. */
    private val clock: Clock = Clock.systemUTC(),
) : OutboxHandler {

    private val log = AppLogger.of(NoteSummaryUpdateRequestedHandler::class)

    override val type: OutboxEventType = OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED

    override fun handle(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteSummaryUpdateRequestedPayload::class.java)
        val context = try {
            chatService.getSummaryUpdateContext(
                payload.userId, payload.chatId, payload.afterMessageId, payload.throughMessageId,
            )
        } catch (_: NotFoundException) {
            throw NonRetryableOutboxException("chat id=${payload.chatId} was deleted before the update of note id=${payload.noteId}")
        }
        val note = noteService.findReadyNote(payload.userId, payload.noteId)
            ?: throw NonRetryableOutboxException("note id=${payload.noteId} is gone or not ready for its summary update")
        val relatedChunks = ragService.searchExcluding(
            userId = payload.userId,
            query = SummaryRetrievalQuery.build(context, properties.retrievalQueryMaxChars),
            limit = properties.retrievalTopK,
            minSimilarity = properties.retrievalMinSimilarity,
            excludeNoteId = payload.noteId,
        )
        val draft: NoteAddendumDraft? = chatClient.prompt()
            .system(ChatPrompts.NOTE_UPDATE_SYSTEM_PROMPT)
            .user(ChatPrompts.noteUpdateUserPrompt(note.title, note.content.orEmpty(), context, relatedChunks))
            .options(
                OpenAiChatOptions.builder()
                    .reasoningEffort(properties.reasoningEffort)
                    .verbosity(properties.verbosity)
            )
            .call()
            .entity(NoteAddendumDraft::class.java) { it.useProviderStructuredOutput() }
        val addendum = checkNotNull(draft) { "summary update model returned no draft" }.toAddendumContent()
        noteService.applyChatSummaryUpdate(
            payload.userId,
            payload.idempotencyKey,
            payload.noteId,
            payload.chatId,
            payload.afterMessageId,
            payload.throughMessageId,
            addendum,
            LocalDate.now(clock),
        )
    }
}
