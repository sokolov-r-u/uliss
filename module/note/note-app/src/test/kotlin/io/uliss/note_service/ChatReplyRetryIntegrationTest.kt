package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.util.ChatPrompts
import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChatReplyRetryIntegrationTest : NoteIntegrationTest() {

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
    lateinit var summaryRequestStore: SummaryRequestStore

    private val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)

    private fun provider(vararg replies: Flux<ChatResponse>) {
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.chatResponse()).thenReturn(replies.first(), *replies.drop(1).toTypedArray())
    }

    private fun text(vararg chunks: String): Flux<ChatResponse> =
        Flux.fromArray(chunks).map { ChatResponse(listOf(Generation(AssistantMessage(it)))) }

    private fun failure(): Flux<ChatResponse> = Flux.error(IllegalStateException("provider down"))

    private fun send(userId: UUID, chatId: UUID, content: String): UUID =
        UUID.fromString(
            mockMvc.post("/note/chats/$chatId/messages") {
                with(jwt().jwt { it.claim("userId", userId.toString()) })
                header("Idempotency-Key", UUID.randomUUID())
                contentType = MediaType.APPLICATION_JSON
                this.content = """{"content":"$content"}"""
            }.asyncDispatch().andReturn().response.getHeader("Chat-Turn-Id"),
        )

    private fun retry(userId: UUID, chatId: UUID, turnId: UUID, messageId: UUID) =
        mockMvc.post("/note/chats/$chatId/turns/$turnId/retry") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            param("messageId", messageId.toString())
        }

    private fun reply(turnId: UUID): ChatMessageEntity =
        chatMessageRepository.findByTurnIdAndRole(turnId, ChatMessageRole.ASSISTANT)!!

    @Test
    fun `a retry replaces a failed reply in the same turn and a repeated retry only replays it`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Retry"))
        provider(failure(), text("New", " answer"))
        val turnId = send(userId, chat.id, "Question")
        val failed = reply(turnId)
        assertEquals(ChatMessageStatus.FAILED, failed.status)

        val retried = retry(userId, chat.id, turnId, failed.id).asyncDispatch().andExpect {
            status { isOk() }
            header { string("Chat-Turn-Id", turnId.toString()) }
            content { string(Matchers.containsString("event:done")) }
        }.andReturn().response.contentAsString
        assertTrue(retried.contains("event:append"))

        val messages = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id)
        assertEquals(listOf(ChatMessageRole.USER, ChatMessageRole.ASSISTANT), messages.map { it.role })
        assertTrue(messages.all { it.turnId == turnId })
        assertEquals("New answer", messages.last().content)
        assertEquals(ChatMessageStatus.COMPLETE, messages.last().status)

        val replayed = retry(userId, chat.id, turnId, failed.id).asyncDispatch().andExpect {
            status { isOk() }
            content { string(Matchers.containsString("event:done")) }
        }.andReturn().response.contentAsString
        assertFalse(replayed.contains("event:append"))
        Mockito.verify(chatClient, Mockito.times(2)).prompt()
    }

    @Test
    fun `an interrupted reply can be retried too`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Retry partial"))
        provider(text("Half").concatWith(failure()), text("Whole"))
        val turnId = send(userId, chat.id, "Question")
        val partial = reply(turnId)
        assertEquals(ChatMessageStatus.PARTIAL, partial.status)

        retry(userId, chat.id, turnId, partial.id).asyncDispatch().andExpect { status { isOk() } }

        assertEquals("Whole", reply(turnId).content)
        assertEquals(ChatMessageStatus.COMPLETE, reply(turnId).status)
    }

    @Test
    fun `a complete or earlier reply is not retried`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "No retry"))
        provider(failure(), text("Second"))
        val first = send(userId, chat.id, "First")
        val second = send(userId, chat.id, "Second")

        retry(userId, chat.id, first, reply(first).id).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("CHAT_REPLY_NOT_RETRYABLE") }
        }
        retry(userId, chat.id, second, reply(second).id).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("CHAT_REPLY_NOT_RETRYABLE") }
        }
        retry(UUID.randomUUID(), chat.id, second, reply(second).id).andExpect { status { isNotFound() } }
    }

    @Test
    fun `a summary that covered the failed reply covers the user message after the retry`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Summarized"))
        provider(failure(), text("Answer"))
        val turnId = send(userId, chat.id, "Question")
        val failed = reply(turnId)
        val note = noteRepository.save(NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), userId, failed.id))

        retry(userId, chat.id, turnId, failed.id).asyncDispatch().andExpect { status { isOk() } }

        val user = chatMessageRepository.findByTurnIdAndRole(turnId, ChatMessageRole.USER)!!
        assertEquals(user.id, chatNoteRepository.findByIdOrNull(ChatNoteId(chat.id, note.id))?.summarizedThroughMessageId)
    }

    @Test
    fun `a summary still being written through the failed reply keeps it from a retry`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Summarizing"))
        provider(failure(), text("Answer"))
        val turnId = send(userId, chat.id, "Question")
        val failed = reply(turnId)
        val note = noteRepository.save(NoteEntity(userId, "summary", NoteSource.CHAT_SUMMARY))
        summaryRequestStore.reserve(userId, UUID.randomUUID(), chat.id, failed.id, note.id)

        retry(userId, chat.id, turnId, failed.id).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("SUMMARY_IN_PROGRESS") }
        }
        assertEquals(ChatMessageStatus.FAILED, reply(turnId).status)
    }
}
