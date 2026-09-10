package io.uliss.note_service.outbox

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.anyValue
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.repository.RetrievedChunk
import io.uliss.note_service.service.ChatService
import io.uliss.note_service.service.ChatSummaryContext
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.RagService
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

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
    )
    private val handler = NoteSummaryRequestedHandler(
        objectMapper,
        chatClient,
        chatService,
        ragService,
        noteService,
        properties,
    )

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
            RetrievedChunk(UUID.randomUUID(), 2, "The user prefers explicit ownership columns.", 0.88)
        )
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId))
            .thenReturn(context)
        Mockito.`when`(
            ragService.search(anyValue<UUID>(), anyValue<String>(), Mockito.anyInt(), Mockito.anyDouble())
        )
            .thenReturn(related)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn("  Final summary  ")

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
        assertTrue(systemPrompt.contains("Preserve important domain terms, technology names, and acronyms"))
        assertTrue(systemPrompt.contains("Do not invent synonyms, acronym expansions, or terminology"))
        Mockito.verify(noteService).completeChatSummary(payload.userId, payload.noteId, "Final summary")
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
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn("Summary")

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
    fun `retrieval query preserves unicode and multiline text when the chat fits`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Архитектура заметок 📝",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "Первая строка\nВторая строка"),
                message(chatId, ChatMessageRole.ASSISTANT, "Используем PostgreSQL и pgvector ✅"),
            ),
        )

        val query = buildRetrievalQuery(context, maxChars = 500)

        assertEquals(
            "Chat title: Архитектура заметок 📝\n" +
                    "Transcript:\n" +
                    "USER: Первая строка\nВторая строка\n" +
                    "ASSISTANT: Используем PostgreSQL и pgvector ✅",
            query,
        )
    }

    @Test
    fun `retrieval query uses the complete transcript when its rendered length exactly matches the limit`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Boundary",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "question"),
                message(chatId, ChatMessageRole.ASSISTANT, "answer"),
            ),
        )
        val expected = "Chat title: Boundary\nTranscript:\nUSER: question\nASSISTANT: answer"

        val query = buildRetrievalQuery(context, maxChars = expected.length)

        assertEquals(expected, query)
        assertTrue("[Earlier messages omitted]" !in query)
    }

    @Test
    fun `retrieval query keeps the beginning of an oversized initial message and the recent conversation`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Large initial request",
            messages = listOf(
                message(
                    chatId,
                    ChatMessageRole.USER,
                    "INITIAL_MARKER " + "initial details ".repeat(30) + "DROPPED_INITIAL_END",
                ),
                message(chatId, ChatMessageRole.ASSISTANT, "middle ".repeat(30)),
                message(chatId, ChatMessageRole.USER, "RECENT_USER_DECISION"),
                message(chatId, ChatMessageRole.ASSISTANT, "FINAL_ASSISTANT_CONCLUSION"),
            ),
        )

        val query = buildRetrievalQuery(context, maxChars = 320)

        assertEquals(320, query.length)
        assertTrue(query.contains("Initial user messages:\nUSER: INITIAL_MARKER"))
        assertTrue(query.substringBefore("\n\n[Earlier messages omitted]").endsWith("…"))
        assertTrue("DROPPED_INITIAL_END" !in query)
        assertTrue(query.contains("USER: RECENT_USER_DECISION"))
        assertTrue(query.endsWith("FINAL_ASSISTANT_CONCLUSION"))
    }

    @Test
    fun `retrieval query keeps the end of an oversized final message`() {
        val chatId = UUID.randomUUID()
        val finalContent = "DROPPED_FINAL_START " + "latest details ".repeat(40) + "FINAL_MARKER"
        val context = ChatSummaryContext(
            title = "Large final response",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "initial request"),
                message(chatId, ChatMessageRole.ASSISTANT, "middle ".repeat(30)),
                message(chatId, ChatMessageRole.ASSISTANT, finalContent),
            ),
        )

        val query = buildRetrievalQuery(context, maxChars = 280)

        assertEquals(280, query.length)
        assertTrue(query.contains("Initial user messages:\nUSER: initial request"))
        assertTrue(query.contains("Recent conversation:\nASSISTANT: …"))
        assertTrue("DROPPED_FINAL_START" !in query)
        assertTrue(query.endsWith("FINAL_MARKER"))
    }

    @Test
    fun `retrieval query never exceeds a limit smaller than its structural prefixes`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "A title that is longer than the available query budget",
            messages = listOf(message(chatId, ChatMessageRole.USER, "content")),
        )

        val query = buildRetrievalQuery(context, maxChars = 24)

        assertEquals(24, query.length)
        assertEquals("Chat title: A title that", query)
    }

    @Test
    fun `handle treats a blank model response as retryable failure`() {
        val payload = payload()
        val context = ChatSummaryContext(
            "Architecture",
            listOf(message(payload.chatId, ChatMessageRole.USER, "Summarize this")),
        )
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId))
            .thenReturn(context)
        Mockito.`when`(
            ragService.search(anyValue<UUID>(), anyValue<String>(), Mockito.anyInt(), Mockito.anyDouble())
        )
            .thenReturn(emptyList())
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn("   ")

        assertFailsWith<IllegalStateException> {
            handler.handle(event(payload))
        }
        Mockito.verifyNoInteractions(noteService)
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

    private fun buildRetrievalQuery(context: ChatSummaryContext, maxChars: Int): String {
        val payload = payload()
        val localChatClient = Mockito.mock(ChatClient::class.java)
        val localChatService = Mockito.mock(ChatService::class.java)
        val localRagService = Mockito.mock(RagService::class.java)
        val localNoteService = Mockito.mock(NoteService::class.java)
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val callResponseSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        val localHandler = NoteSummaryRequestedHandler(
            objectMapper,
            localChatClient,
            localChatService,
            localRagService,
            localNoteService,
            NoteSummaryProperties(
                retrievalQueryMaxChars = maxChars,
                retrievalTopK = 3,
                retrievalMinSimilarity = 0.75,
            ),
        )
        Mockito.`when`(
            localChatService.getSummaryContext(payload.userId, payload.chatId, payload.throughMessageId)
        ).thenReturn(context)
        Mockito.`when`(
            localRagService.search(anyValue<UUID>(), anyValue<String>(), Mockito.anyInt(), Mockito.anyDouble())
        ).thenReturn(emptyList())
        Mockito.`when`(localChatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.call()).thenReturn(callResponseSpec)
        Mockito.`when`(callResponseSpec.content()).thenReturn("Summary")

        localHandler.handle(event(payload))

        return Mockito.mockingDetails(localRagService).invocations
            .single { it.method.name == "search" }
            .arguments[1] as String
    }
}
