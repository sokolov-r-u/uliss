package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.dto.internal.AssistantStreamEvent
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryMode
import io.uliss.note_service.model.projection.ChatTurnStatus
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.service.AssistantService
import io.uliss.note_service.service.ChatTurnService
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.service.facade.ChatFacade
import io.uliss.note_service.util.ChatPrompts
import org.hamcrest.Matchers
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class NoteLifecycleApiIntegrationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var assistantService: AssistantService

    @Autowired
    lateinit var chatFacade: ChatFacade

    @Autowired
    lateinit var noteService: NoteService

    @MockitoBean
    lateinit var chatClient: ChatClient

    @MockitoSpyBean
    lateinit var chatTurnService: ChatTurnService

    @Test
    fun `second summarize updates the current note and the latest page reports the moved boundary`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Update chat"))
        val first = chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "First thought", ChatMessageStatus.COMPLETE)
        )
        val noteId = summarize(userId, chat.id, null)
        noteService.completeChatSummary(userId, noteId, "Title", "Body")
        val second = chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "Second thought", ChatMessageStatus.COMPLETE)
        )

        mockMvc.post("/note/chats/${chat.id}/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
        }.andExpect { status { isConflict() } }

        val key = UUID.randomUUID()
        mockMvc.post("/note/chats/${chat.id}/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", key)
            contentType = MediaType.APPLICATION_JSON
            content = """{"mode":"UPDATE","targetNoteId":"$noteId"}"""
        }.andExpect {
            status { isAccepted() }
            jsonPath("$.status") { value("READY") }
        }
        val event = outboxEventRepository.findAll().single {
            it.type == OutboxEventType.NOTE_SUMMARY_UPDATE_REQUESTED && it.payload.contains(noteId.toString())
        }
        val payload = objectMapper.readTree(event.payload)
        assertEquals(first.id.toString(), payload["afterMessageId"].stringValue())
        assertEquals(second.id.toString(), payload["throughMessageId"].stringValue())
        mockMvc.get("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            jsonPath("$.status") { value("READY") }
            jsonPath("$.updating") { value(true) }
        }

        chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "Sent while generating", ChatMessageStatus.COMPLETE)
        )
        noteService.applyChatSummaryUpdate(
            userId, key, noteId, chat.id, first.id, second.id, "Added.", LocalDate.of(2026, 10, 8),
        )

        mockMvc.get("/note/chats/${chat.id}/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            jsonPath("$.summary.noteId") { value(noteId.toString()) }
            jsonPath("$.summary.throughMessageId") { value(second.id.toString()) }
        }
        mockMvc.get("/note/notes/$noteId") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { jsonPath("$.updating") { value(false) } }
        assertEquals("Body\n\n---\n\n## 2026-10-08\n\nAdded.", noteRepository.findById(noteId).orElseThrow().content)
    }

    @Test
    fun `summary request persists placeholder link and outbox event before returning 202`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Contract chat"))
        val message = chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "Summarize this", ChatMessageStatus.COMPLETE)
        )

        val result = mockMvc.post("/note/chats/${chat.id}/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
        }.andExpect {
            status { isAccepted() }
            jsonPath("$.chatId") { value(chat.id.toString()) }
            jsonPath("$.status") { value("GENERATING") }
            jsonPath("$.content") { doesNotExist() }
        }.andReturn()

        val response = objectMapper.readTree(result.response.contentAsString)
        val noteId = UUID.fromString(response["noteId"].stringValue())

        val note = noteRepository.findById(noteId).orElseThrow()
        assertEquals(userId, note.userId)
        assertEquals(NoteSource.CHAT_SUMMARY, note.source)
        assertEquals(NoteStatus.GENERATING, note.status)
        assertEquals(null, note.content)
        assertEquals(userId.toString(), note.createdBy)
        assertTrue(chatNoteRepository.existsById(ChatNoteId(chat.id, noteId)))

        val event = outboxEventRepository.findAll().single {
            it.type == OutboxEventType.NOTE_SUMMARY_REQUESTED && it.payload.contains(noteId.toString())
        }
        val payload = objectMapper.readTree(event.payload)
        assertEquals(userId.toString(), payload["userId"].stringValue())
        assertEquals(chat.id.toString(), payload["chatId"].stringValue())
        assertEquals(message.id.toString(), payload["throughMessageId"].stringValue())
    }

    @Test
    fun `summary boundary includes the assistant reply after the stream completes`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Streamed chat"))
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        val persistenceStarted = CountDownLatch(1)
        val releasePersistence = CountDownLatch(1)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.chatResponse())
            .thenReturn(Flux.just("Final", " answer").map { ChatResponse(listOf(Generation(AssistantMessage(it)))) })
        Mockito.doAnswer { invocation ->
            assertEquals(userId, invocation.getArgument(0))
            assertEquals(chat.id, invocation.getArgument(1))
            assertEquals(1, invocation.getArgument(3))
            assertEquals("Final answer", invocation.getArgument(4))
            assertEquals(ChatTurnStatus.COMPLETE, invocation.getArgument(5))
            persistenceStarted.countDown()
            assertTrue(releasePersistence.await(1, TimeUnit.SECONDS))
            invocation.callRealMethod()
        }.`when`(chatTurnService).finishGenerationAttempt(
            anyValue(),
            anyValue(),
            anyValue(),
            Mockito.anyInt(),
            anyValue(),
            anyValue(),
        )

        val reply = assistantService.streamReply(userId, chat.id, UUID.randomUUID(), "Question") { _, _, _ -> emptyList() }
        val streamedReply = reply.events.collectList().toFuture()

        try {
            assertTrue(persistenceStarted.await(1, TimeUnit.SECONDS))
            assertFalse(streamedReply.isDone)
        } finally {
            releasePersistence.countDown()
        }
        assertEquals(
            listOf(
                AssistantStreamEvent.AppendText("Final"),
                AssistantStreamEvent.AppendText(" answer"),
                AssistantStreamEvent.GenerationCompleted,
            ),
            streamedReply.get(1, TimeUnit.SECONDS),
        )

        chatFacade.requestSummary(userId, chat.id, UUID.randomUUID(), SummaryMode.CREATE, null)

        val assistantMessage = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id).last()
        assertEquals(ChatMessageRole.ASSISTANT, assistantMessage.role)
        assertEquals(reply.turnId, assistantMessage.turnId)
        assertEquals(ChatMessageStatus.COMPLETE, assistantMessage.status)
        val event = outboxEventRepository.findAll().single {
            it.type == OutboxEventType.NOTE_SUMMARY_REQUESTED && it.payload.contains(chat.id.toString())
        }
        val payload = objectMapper.readTree(event.payload)
        assertEquals(assistantMessage.id.toString(), payload["throughMessageId"].stringValue())
    }

    @Test
    fun `stream HTTP replay returns the persisted turn identity without generating twice`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "HTTP stream"))
        val key = UUID.randomUUID()
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.chatResponse())
            .thenReturn(Flux.just("Answer").map { ChatResponse(listOf(Generation(AssistantMessage(it)))) })

        fun send() = mockMvc.post("/note/chats/${chat.id}/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", key)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"Question"}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            header { string("Idempotency-Key", key.toString()) }
            content { string(Matchers.containsString("event:done")) }
        }.andReturn().response

        val first = send()
        val turnId = UUID.fromString(first.getHeader("Chat-Turn-Id"))
        assertNotEquals(key, turnId)
        assertTrue(first.contentAsString.contains("event:append"))
        val replay = send()
        assertEquals(turnId.toString(), replay.getHeader("Chat-Turn-Id"))
        assertFalse(replay.contentAsString.contains("event:append"))
        val messages = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id)
        assertEquals(listOf(ChatMessageRole.USER, ChatMessageRole.ASSISTANT), messages.map { it.role })
        assertTrue(messages.all { it.turnId == turnId })
        Mockito.verify(chatClient, Mockito.times(1)).prompt()
    }

    @Test
    fun `initial stream atomically creates the chat and replays both backend identities`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.chatResponse())
            .thenReturn(Flux.just("First answer").map { ChatResponse(listOf(Generation(AssistantMessage(it)))) })

        fun send() = mockMvc.post("/note/chats") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", key)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"  First question\nwith context  "}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            header { string("Idempotency-Key", key.toString()) }
            header { exists("Chat-Id") }
            header { exists("Chat-Turn-Id") }
            content { string(Matchers.containsString("event:done")) }
        }.andReturn().response

        val first = send()
        val chatId = UUID.fromString(first.getHeader("Chat-Id"))
        val turnId = UUID.fromString(first.getHeader("Chat-Turn-Id"))
        assertNotEquals(key, chatId)
        assertNotEquals(key, turnId)
        assertNotEquals(chatId, turnId)
        assertTrue(first.contentAsString.contains("event:append"))
        assertEquals("First question", chatRepository.findById(chatId).orElseThrow().title)
        val replay = send()
        assertEquals(chatId.toString(), replay.getHeader("Chat-Id"))
        assertEquals(turnId.toString(), replay.getHeader("Chat-Turn-Id"))
        assertFalse(replay.contentAsString.contains("event:append"))
        val messages = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chatId)
        assertEquals(listOf(ChatMessageRole.USER, ChatMessageRole.ASSISTANT), messages.map { it.role })
        assertTrue(messages.all { it.turnId == turnId })
        Mockito.verify(chatClient, Mockito.times(1)).prompt()
    }

    @Test
    fun `initial provider setup failure keeps the reserved chat and persists FAILED`() {
        val userId = UUID.randomUUID()
        val idempotencyKey = UUID.randomUUID()
        Mockito.doThrow(RuntimeException("provider setup failed")).`when`(chatClient).prompt()

        val response = mockMvc.post("/note/chats") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", idempotencyKey)
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"Question that must remain durable"}"""
        }.asyncDispatch().andExpect {
            status { isOk() }
            header { exists("Chat-Id") }
            header { exists("Chat-Turn-Id") }
            content {
                string(Matchers.containsString("event:error"))
                string(Matchers.not(Matchers.containsString("event:done")))
            }
        }.andReturn().response

        val chatId = UUID.fromString(response.getHeader("Chat-Id"))
        val turnId = UUID.fromString(response.getHeader("Chat-Turn-Id"))
        assertEquals(chatId, chatRepository.findByUserIdAndIdempotencyKey(userId, idempotencyKey)?.id)
        val messages = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chatId)
        assertEquals(listOf(ChatMessageRole.USER, ChatMessageRole.ASSISTANT), messages.map { it.role })
        assertEquals(listOf(ChatMessageStatus.COMPLETE, ChatMessageStatus.FAILED), messages.map { it.status })
        assertTrue(messages.all { it.turnId == turnId })
    }

    @Test
    fun `note list is ownership filtered and newest first`() {
        val userId = UUID.randomUUID()
        val older = saveNote(userId, "older", NoteStatus.READY, Instant.parse("2026-09-09T10:00:00Z"))
        val newer = saveNote(userId, null, NoteStatus.GENERATING, Instant.parse("2026-09-10T10:00:00Z"))
        saveNote(UUID.randomUUID(), "foreign", NoteStatus.READY, Instant.parse("2026-09-11T10:00:00Z"))

        mockMvc.get("/note/notes") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(newer.id.toString()) }
            jsonPath("$[0].status") { value("GENERATING") }
            jsonPath("$[0].content") { value(Matchers.nullValue()) }
            jsonPath("$[1].id") { value(older.id.toString()) }
            jsonPath("$[1].content") { value("older") }
            jsonPath("$[2]") { doesNotExist() }
        }
    }

    @Test
    fun `note detail makes foreign and missing ids indistinguishable`() {
        val ownerId = UUID.randomUUID()
        val requesterId = UUID.randomUUID()
        val foreignNote = saveNote(ownerId, "private", NoteStatus.READY, Instant.now())

        listOf(foreignNote.id, UUID.randomUUID()).forEach { noteId ->
            mockMvc.get("/note/notes/$noteId") {
                with(jwt().jwt { it.claim("userId", requesterId.toString()) })
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.status") { value(404) }
                jsonPath("$.code") { value("NOT_FOUND_ERROR") }
                jsonPath("$.path") { value("/note/notes/$noteId") }
                // the same text for a foreign and a missing note: only the requested id
                jsonPath("$.details.message") { value("note id=$noteId not found") }
            }
        }
    }

    @Test
    fun `status stream immediately emits persisted terminal state without note content`() {
        val userId = UUID.randomUUID()
        val note = saveNote(userId, "must not be streamed", NoteStatus.READY, Instant.now())

        mockMvc.get("/note/notes/${note.id}/status/stream") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            accept = MediaType.TEXT_EVENT_STREAM
        }.asyncDispatch().andExpect {
            status { isOk() }
            content {
                contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                string(Matchers.containsString("event:status"))
                string(Matchers.containsString("\"noteId\":\"${note.id}\""))
                string(Matchers.containsString("\"status\":\"READY\""))
                string(Matchers.not(Matchers.containsString("must not be streamed")))
            }
        }
    }

    private fun saveNote(
        userId: UUID,
        content: String?,
        status: NoteStatus,
        createdAt: Instant,
    ): NoteEntity {
        val note = noteRepository.saveAndFlush(
            NoteEntity(userId, content, NoteSource.CHAT_SUMMARY, status)
        )
        note.createdAt = createdAt
        return noteRepository.saveAndFlush(note)
    }

    private fun summarize(userId: UUID, chatId: UUID, body: String?): UUID {
        val result = mockMvc.post("/note/chats/$chatId/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
            if (body != null) {
                contentType = MediaType.APPLICATION_JSON
                content = body
            }
        }.andExpect { status { isAccepted() } }.andReturn()
        return UUID.fromString(objectMapper.readTree(result.response.contentAsString)["noteId"].stringValue())
    }
}
