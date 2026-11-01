package io.uliss.note_service.service.handler

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.dto.internal.NoteBodyDraft
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteResummarizeRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.outbox.OutboxHandler
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteHierarchyService
import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.util.ChatPrompts
import io.uliss.note_service.util.SummaryRetrievalQuery
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

/**
 * "Summarize again": rewrites a READY summary note from its whole chat with the create prompt, the note's title and
 * icon given as the user's, so only the body is generated. The old text is not shown to the model.
 */
@Component
class NoteResummarizeRequestedHandler(
    private val objectMapper: ObjectMapper,
    private val chatClient: ChatClient,
    private val chatService: ChatService,
    private val ragService: RagService,
    private val noteSummaryService: NoteSummaryService,
    private val noteHierarchyService: NoteHierarchyService,
    private val properties: NoteSummaryProperties,
) : OutboxHandler {

    override val type: OutboxEventType = OutboxEventType.NOTE_RESUMMARIZE_REQUESTED

    override fun handle(event: OutboxEventEntity) {
        val payload = objectMapper.readValue(event.payload, NoteResummarizeRequestedPayload::class.java)
        val note = noteSummaryService.findReadyNote(payload.userId, payload.noteId)
            ?: throw NonRetryableOutboxException("note id=${payload.noteId} is gone or not ready to be summarized again")
        val context = try {
            chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId)
        } catch (_: NotFoundException) {
            throw NonRetryableOutboxException("chat id=${payload.chatId} was deleted before note id=${payload.noteId} was rewritten")
        }
        // read now, not at request time: the user may have moved the note while the event waited
        val place = noteHierarchyService.getPlaceDescription(payload.userId, payload.noteId)
        val relatedChunks = ragService.searchExcluding(
            userId = payload.userId,
            query = SummaryRetrievalQuery.build(context, properties.retrievalQueryMaxChars),
            limit = properties.retrievalTopK,
            minSimilarity = properties.retrievalMinSimilarity,
            excludeNoteId = payload.noteId,
        )
        val draft: NoteBodyDraft? = chatClient.prompt()
            .system(ChatPrompts.NOTE_SUMMARY_SYSTEM_PROMPT)
            .user(ChatPrompts.noteSummaryUserPrompt(context, place, relatedChunks, note.title, note.icon))
            .options(
                OpenAiChatOptions.builder()
                    .reasoningEffort(properties.reasoningEffort)
                    .verbosity(properties.verbosity)
            )
            .call()
            .entity(NoteBodyDraft::class.java) { it.useProviderStructuredOutput() }
        val content = checkNotNull(draft) { "resummarize model returned no draft" }.toNoteContent()
        noteSummaryService.applyResummarize(
            payload.userId, payload.idempotencyKey, payload.noteId, payload.chatId, payload.throughMessageId, content,
        )
    }
}
