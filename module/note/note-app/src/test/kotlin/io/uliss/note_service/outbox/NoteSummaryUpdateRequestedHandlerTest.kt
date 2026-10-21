package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.dto.internal.NoteAddendumDraft
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryUpdateRequestedPayload
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteSummaryService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.service.handler.NoteSummaryProperties
import io.uliss.note_service.service.handler.NoteSummaryUpdateRequestedHandler
import io.uliss.note_service.util.ChatPrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import tools.jackson.databind.json.JsonMapper
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NoteSummaryUpdateRequestedHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val chatService = Mockito.mock(ChatService::class.java)
    private val ragService = Mockito.mock(RagService::class.java)
    private val noteService = Mockito.mock(NoteSummaryService::class.java)
    private val properties = NoteSummaryProperties(retrievalQueryMaxChars = 400, retrievalTopK = 3, retrievalMinSimilarity = 0.75)
    private val clock = Clock.fixed(Instant.parse("2026-10-08T23:30:00Z"), ZoneOffset.UTC)
    private val handler = NoteSummaryUpdateRequestedHandler(
        objectMapper, chatClient, chatService, ragService, noteService, properties, clock,
    )
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)

    @Test
    fun `handle sends the note and only the new messages, excludes the note from RAG and applies the addendum`() {
        val payload = payload()
        val note = NoteEntity(payload.userId, "Fly to Rome.", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Trip")
        stubContext(payload, "Rather by train")
        Mockito.`when`(noteService.findReadyNote(payload.userId, payload.noteId)).thenReturn(note)
        stubModel(NoteAddendumDraft(false, "Go by night train.", emptyList()))

        handler.handle(event(payload))

        val search = Mockito.mockingDetails(ragService).invocations.single { it.method.name == "searchExcluding" }
        assertTrue((search.arguments[1] as String).contains("Rather by train"))
        assertEquals(payload.noteId, search.arguments[4])
        val userPrompt = Mockito.mockingDetails(requestSpec).invocations.single { it.method.name == "user" }
            .arguments[0] as String
        assertTrue(userPrompt.contains("EXISTING NOTE (already written; do not repeat):\nTitle: Trip\nFly to Rome."))
        val systemPrompt = Mockito.mockingDetails(requestSpec).invocations.single { it.method.name == "system" }
            .arguments[0] as String
        assertEquals(ChatPrompts.NOTE_UPDATE_SYSTEM_PROMPT, systemPrompt)
        Mockito.verify(noteService).applyChatSummaryUpdate(
            payload.userId, payload.idempotencyKey, payload.noteId, payload.chatId, payload.afterMessageId,
            payload.throughMessageId,
            "Go by night train.", LocalDate.of(2026, 10, 8),
        )
    }

    @Test
    fun `handle records nothing new`() {
        val payload = payload()
        stubContext(payload, "ok")
        Mockito.`when`(noteService.findReadyNote(payload.userId, payload.noteId))
            .thenReturn(NoteEntity(payload.userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY))
        stubModel(NoteAddendumDraft(true, "", emptyList()))

        handler.handle(event(payload))

        Mockito.verify(noteService).applyChatSummaryUpdate(
            payload.userId, payload.idempotencyKey, payload.noteId, payload.chatId, payload.afterMessageId,
            payload.throughMessageId,
            null, LocalDate.of(2026, 10, 8),
        )
    }

    @Test
    fun `handle fails terminally without the model when the note is gone or the chat is deleted`() {
        val payload = payload()
        stubContext(payload, "ok")

        assertFailsWith<NonRetryableOutboxException> { handler.handle(event(payload)) }

        Mockito.`when`(
            chatService.getSummaryUpdateContext(payload.userId, payload.chatId, payload.afterMessageId, payload.throughMessageId)
        ).thenThrow(NotFoundException("chat id=${payload.chatId} not found"))
        assertFailsWith<NonRetryableOutboxException> { handler.handle(event(payload)) }

        Mockito.verifyNoInteractions(chatClient, ragService)
    }

    @Test
    fun `handle treats a missing structured response as a retryable failure`() {
        val payload = payload()
        stubContext(payload, "ok")
        Mockito.`when`(noteService.findReadyNote(payload.userId, payload.noteId))
            .thenReturn(NoteEntity(payload.userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY))
        stubModel(null)

        assertFailsWith<IllegalStateException> { handler.handle(event(payload)) }
        Mockito.verify(noteService, Mockito.never())
            .applyChatSummaryUpdate(
                anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), anyValue(), anyValue(),
            )
    }

    private fun stubContext(payload: NoteSummaryUpdateRequestedPayload, content: String) {
        Mockito.`when`(
            chatService.getSummaryUpdateContext(payload.userId, payload.chatId, payload.afterMessageId, payload.throughMessageId)
        ).thenReturn(
            ChatSummaryContext(
                "Trip",
                listOf(ChatMessageEntity(payload.chatId, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE)),
            ),
        )
    }

    private fun stubModel(draft: NoteAddendumDraft?) {
        Mockito.`when`(
            ragService.searchExcluding(anyValue(), anyValue(), Mockito.anyInt(), Mockito.anyDouble(), anyValue())
        ).thenReturn(emptyList())
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.entity(Mockito.eq(NoteAddendumDraft::class.java), anyValue())).thenReturn(draft)
    }

    private fun payload() = NoteSummaryUpdateRequestedPayload(
        noteId = UUID.randomUUID(),
        userId = UUID.randomUUID(),
        chatId = UUID.randomUUID(),
        idempotencyKey = UUID.randomUUID(),
        afterMessageId = UUID.randomUUID(),
        throughMessageId = UUID.randomUUID(),
    )

    private fun event(payload: NoteSummaryUpdateRequestedPayload) = OutboxEventEntity(
        type = OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED,
        payload = objectMapper.writeValueAsString(payload),
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )
}
