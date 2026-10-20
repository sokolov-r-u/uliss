package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.anyValue
import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.dto.internal.NoteDraft
import io.uliss.note_service.exception.NonRetryableOutboxException
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteSummaryRequestedPayload
import io.uliss.note_service.repository.RetrievedChunk
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.RagService
import io.uliss.note_service.service.handler.NoteSummaryProperties
import io.uliss.note_service.service.handler.NoteSummaryRequestedHandler
import io.uliss.note_service.util.ChatPrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import java.util.function.Consumer
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import org.junit.jupiter.api.assertThrows
import org.springframework.orm.ObjectOptimisticLockingFailureException

class NoteSummaryRequestedHandlerTest {

    private val objectMapper = JsonMapper.builder().build()
    private val chatClient = Mockito.mock(ChatClient::class.java)
    private val chatService = Mockito.mock(ChatService::class.java)
    private val ragService = Mockito.mock(RagService::class.java)
    private val noteService = Mockito.mock(NoteService::class.java)
    private val properties = NoteSummaryProperties(
        retrievalQueryMaxChars = 400,
        retrievalTopK = 3,
        retrievalMinSimilarity = 0.75,
        reasoningEffort = "medium",
        verbosity = "low",
    )
    private val handler = NoteSummaryRequestedHandler(
        objectMapper,
        chatClient,
        chatService,
        ragService,
        noteService,
        properties,
    )

    init {
        // the placeholder still waits for its summary unless a test says otherwise
        Mockito.`when`(noteService.isAwaitingSummary(anyValue(), anyValue())).thenReturn(true)
    }

    @Test
    fun `handle retrieves user context summarizes the bounded chat and completes the note`() {
        val payload = payload()
        val context = ChatSummaryContext(
            title = "Architecture",
            messages = listOf(
                message(payload.chatId, ChatMessageRole.USER, "initial intent"),
                message(payload.chatId, ChatMessageRole.ASSISTANT, "middle discussion ".repeat(30)),
                message(payload.chatId, ChatMessageRole.USER, "second constraint"),
                message(payload.chatId, ChatMessageRole.ASSISTANT, "current conclusion"),
            ),
        )
        val related = listOf(
            RetrievedChunk(UUID.randomUUID(), 2, "The user prefers explicit ownership columns.", 0.88, null, Instant.EPOCH)
        )
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId))
            .thenReturn(context)
        Mockito.`when`(
            ragService.search(anyValue(), anyValue(), Mockito.anyInt(), Mockito.anyDouble())
        )
            .thenReturn(related)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.entity(Mockito.eq(NoteDraft::class.java), anyValue()))
            .thenReturn(NoteDraft("Ownership columns", "  Final summary  ", null))

        handler.handle(event(payload))

        val searchInvocation = Mockito.mockingDetails(ragService).invocations.single { it.method.name == "search" }
        assertEquals(payload.userId, searchInvocation.arguments[0])
        val query = searchInvocation.arguments[1] as String
        assertTrue(query.length <= 400)
        assertTrue(query.contains("Initial user messages:\nUSER: initial intent\nUSER: second constraint"))
        assertTrue(query.contains("[Earlier messages omitted]"))
        assertTrue(query.endsWith("current conclusion"))
        assertTrue("(COMPLETE)" !in query)
        assertEquals(3, searchInvocation.arguments[2])
        assertEquals(0.75, searchInvocation.arguments[3])
        val userPrompt = Mockito.mockingDetails(requestSpec).invocations
            .single { it.method.name == "user" }
            .arguments[0] as String
        assertTrue(userPrompt.contains("CURRENT CHAT (authoritative)"))
        assertTrue(userPrompt.contains("The user prefers explicit ownership columns."))
        val systemPrompt = Mockito.mockingDetails(requestSpec).invocations
            .single { it.method.name == "system" }
            .arguments[0] as String
        assertEquals(ChatPrompts.NOTE_SUMMARY_SYSTEM_PROMPT, systemPrompt)
        val options = (Mockito.mockingDetails(requestSpec).invocations
            .single { it.method.name == "options" }
            .arguments[0] as OpenAiChatOptions.Builder).build()
        assertEquals("medium", options.reasoningEffort)
        assertEquals("low", options.verbosity)
        @Suppress("UNCHECKED_CAST")
        val entityParams = Mockito.mockingDetails(callResponseSpec).invocations
            .single { it.method.name == "entity" }
            .arguments[1] as Consumer<ChatClient.EntityParamSpec>
        val entityParamSpec = Mockito.mock(ChatClient.EntityParamSpec::class.java)
        entityParams.accept(entityParamSpec)
        Mockito.verify(entityParamSpec).useProviderStructuredOutput()
        Mockito.verify(noteService)
            .completeChatSummary(payload.userId, payload.noteId, "Ownership columns", "Final summary")
    }

    @Test
    fun `handle leaves a save conflict to the outbox instead of retrying it`() {
        // e.g. the outbox failed the note concurrently: the late summary is dropped, not forced in
        val payload = payload()
        Mockito.`when`(noteService.completeChatSummary(payload.userId, payload.noteId, "Title", "Summary"))
            .thenThrow(ObjectOptimisticLockingFailureException("NoteEntity", payload.noteId))

        assertThrows<ObjectOptimisticLockingFailureException> {
            handleWithDraft(payload, NoteDraft("Title", "Summary", null))
        }
        Mockito.verify(noteService, Mockito.times(1))
            .completeChatSummary(payload.userId, payload.noteId, "Title", "Summary")
    }

    @Test
    fun `handle normalizes a decorated model title`() {
        val payload = payload()

        handleWithDraft(payload, NoteDraft("  # \"Ownership   columns\"\n", "Summary", null))

        Mockito.verify(noteService)
            .completeChatSummary(payload.userId, payload.noteId, "Ownership columns", "Summary")
    }

    @Test
    fun `handle stores the note content assembled from the draft`() {
        val payload = payload()

        handleWithDraft(payload, NoteDraft("Night city", "Main thought.", listOf("Secondary thought.")))

        Mockito.verify(noteService).completeChatSummary(
            payload.userId,
            payload.noteId,
            "Night city",
            "Main thought.\n\n- Secondary thought.",
        )
    }

    @Test
    fun `handle derives the title from the content when the model title is blank`() {
        val payload = payload()

        handleWithDraft(payload, NoteDraft("  ", "\n## Ownership columns\n- keep user_id", emptyList()))

        Mockito.verify(noteService).completeChatSummary(
            payload.userId,
            payload.noteId,
            "Ownership columns",
            "## Ownership columns\n- keep user_id",
        )
    }

    @Test
    fun `handle treats a missing structured response as retryable failure`() {
        val payload = payload()

        assertFailsWith<IllegalStateException> {
            handleWithDraft(payload, null)
        }
        // nothing is stored from a failed draft; the readiness check before the model is the only call
        Mockito.verify(noteService, Mockito.never()).completeChatSummary(anyValue(), anyValue(), anyValue(), anyValue())
    }

    @Test
    fun `handle uses the complete semantic transcript when it fits the retrieval query limit`() {
        val payload = payload()
        val context = ChatSummaryContext(
            title = "Short chat",
            messages = listOf(
                message(payload.chatId, ChatMessageRole.USER, "question"),
                message(payload.chatId, ChatMessageRole.ASSISTANT, "answer"),
                ChatMessageEntity(
                    payload.chatId,
                    ChatMessageRole.ASSISTANT,
                    "",
                    ChatMessageStatus.FAILED,
                ),
            ),
        )
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId))
            .thenReturn(context)
        Mockito.`when`(
            ragService.search(anyValue<UUID>(), anyValue<String>(), Mockito.anyInt(), Mockito.anyDouble())
        ).thenReturn(emptyList())
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.entity(Mockito.eq(NoteDraft::class.java), anyValue()))
            .thenReturn(NoteDraft("Title", "Summary", null))

        handler.handle(event(payload))

        val query = Mockito.mockingDetails(ragService).invocations
            .single { it.method.name == "search" }
            .arguments[1] as String
        assertEquals(
            "Chat title: Short chat\nTranscript:\nUSER: question\nASSISTANT: answer",
            query,
        )
    }

    @Test
    fun `handle treats a blank main thought as retryable failure`() {
        val payload = payload()

        assertFailsWith<IllegalStateException> {
            handleWithDraft(payload, NoteDraft("Title", "   ", listOf("Orphan secondary thought")))
        }
        Mockito.verify(noteService, Mockito.never()).completeChatSummary(anyValue(), anyValue(), anyValue(), anyValue())
    }

    private fun handleWithDraft(payload: NoteSummaryRequestedPayload, draft: NoteDraft?) {
        val context = ChatSummaryContext(
            "Architecture",
            listOf(message(payload.chatId, ChatMessageRole.USER, "Summarize this")),
        )
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId))
            .thenReturn(context)
        Mockito.`when`(
            ragService.search(anyValue(), anyValue(), Mockito.anyInt(), Mockito.anyDouble())
        )
            .thenReturn(emptyList())
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.entity(Mockito.eq(NoteDraft::class.java), anyValue())).thenReturn(draft)

        handler.handle(event(payload))
    }

    @Test
    fun `handle fails the note without calling the model when the chat was deleted`() {
        val payload = payload()
        val event = event(payload)
        Mockito.`when`(chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId))
            .thenThrow(NotFoundException("chat id=${payload.chatId} not found"))

        Mockito.`when`(noteService.isAwaitingSummary(payload.userId, payload.noteId)).thenReturn(true)

        assertFailsWith<NonRetryableOutboxException> { handler.handle(event) }

        Mockito.verifyNoInteractions(chatClient, ragService)
    }

    @Test
    fun `handle spends no model call on a note that no longer waits for its summary`() {
        // deleted or already completed while the event waited
        val payload = payload()
        Mockito.`when`(noteService.isAwaitingSummary(payload.userId, payload.noteId)).thenReturn(false)

        handler.handle(event(payload))

        Mockito.verifyNoInteractions(chatClient, ragService, chatService)
    }

    private fun payload() = NoteSummaryRequestedPayload(
        noteId = UUID.randomUUID(),
        userId = UUID.randomUUID(),
        chatId = UUID.randomUUID(),
        throughMessageId = UUID.randomUUID(),
    )

    private fun event(payload: NoteSummaryRequestedPayload) = OutboxEventEntity(
        type = OutboxEventType.NOTE_SUMMARY_REQUESTED,
        payload = objectMapper.writeValueAsString(payload),
        status = OutboxEventStatus.PROCESSING,
        attempts = 0,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    private fun message(chatId: UUID, role: ChatMessageRole, content: String) =
        ChatMessageEntity(chatId, role, content, ChatMessageStatus.COMPLETE)

}
