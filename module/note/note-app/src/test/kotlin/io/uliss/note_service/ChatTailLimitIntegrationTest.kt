package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.SummaryRequestStore
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.ChatTurnStore
import io.uliss.note_service.util.ChatPrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import java.util.UUID
import kotlin.test.assertEquals

/** Small limits, so a few short messages cross them: soft 100, hard 150, summary input 200 characters. */
@TestPropertySource(
    properties = [
        "note.assistant.tail.soft-chars=100",
        "note.assistant.tail.hard-chars=150",
        "note.assistant.tail.summary-input-chars=200",
    ],
)
class ChatTailLimitIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var chatTurnStore: ChatTurnStore

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var summaryRequestStore: SummaryRequestStore

    private fun provider(vararg replies: Flux<ChatResponse>) {
        val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.chatResponse()).thenReturn(replies.first(), *replies.drop(1).toTypedArray())
    }

    private fun text(content: String): Flux<ChatResponse> =
        Flux.just(ChatResponse(listOf(Generation(AssistantMessage(content)))))

    private fun send(userId: UUID, chatId: UUID, content: String, key: UUID = UUID.randomUUID()): ResultActionsDsl =
        mockMvc.post("/note/chats/$chatId/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", key)
            contentType = MediaType.APPLICATION_JSON
            this.content = """{"content":"$content"}"""
        }

    @Test
    fun `a message past the hard limit of a chat without notes is refused before a turn starts`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Long"))
        message(chat, ChatMessageRole.USER, "q".repeat(70))
        message(chat, ChatMessageRole.ASSISTANT, "a".repeat(70))

        send(userId, chat.id, "x".repeat(11)).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("CHAT_TAIL_LIMIT") }
        }

        assertEquals(2, chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id).size)
        assertEquals(null, chatTurnStore.findGenerating(userId, chat.id))
        Mockito.verifyNoInteractions(chatClient)
    }

    @Test
    fun `the latest page tells the tail size after the main note's boundary, the limits and a running summary`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Page"))
        val covered = message(chat, ChatMessageRole.USER, "q".repeat(70))
        message(chat, ChatMessageRole.ASSISTANT, "ответ")
        val note = noteRepository.save(NoteEntity(userId, "Body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Main"))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), userId, covered.id, main = true))
        summaryRequestStore.reserve(userId, UUID.randomUUID(), chat.id, covered.id, note.id)

        mockMvc.get("/note/chats/${chat.id}/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$.tail.chars") { value(5) }
            jsonPath("$.tail.softChars") { value(100) }
            jsonPath("$.tail.hardChars") { value(150) }
            jsonPath("$.tail.summaryInputChars") { value(200) }
            jsonPath("$.tail.summarizing") { value(true) }
        }
    }

    @Test
    fun `only the messages after the main note's boundary count against the limit`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Summarized"))
        message(chat, ChatMessageRole.USER, "q".repeat(140))
        val covered = message(chat, ChatMessageRole.ASSISTANT, "a".repeat(140))
        linkMainNote(chat, covered.id)
        message(chat, ChatMessageRole.USER, "after")
        provider(text("Answer"))

        send(userId, chat.id, "x".repeat(100)).asyncDispatch().andExpect { status { isOk() } }
    }

    @Test
    fun `a request repeated with its key after the tail crossed the limit replays its turn`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Replay"))
        provider(text("a".repeat(140)))
        val key = UUID.randomUUID()
        send(userId, chat.id, "q".repeat(20), key).asyncDispatch().andExpect { status { isOk() } }

        send(userId, chat.id, "q".repeat(20), key).asyncDispatch().andExpect { status { isOk() } }
        assertEquals(2, chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id).size)
    }

    @Test
    fun `a failed reply of a chat past the limit can still be retried`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Retry"))
        provider(Flux.error(IllegalStateException("provider down")), text("Answer"))
        send(userId, chat.id, "q".repeat(160)).asyncDispatch()
        send(userId, chat.id, "next").andExpect { status { isConflict() } }
        val failed = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id)
            .single { it.role == ChatMessageRole.ASSISTANT }

        mockMvc.post("/note/chats/${chat.id}/turns/${failed.turnId}/retry") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            param("messageId", failed.id.toString())
        }.asyncDispatch().andExpect { status { isOk() } }
        assertEquals("Answer", chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id).last().content)
    }

    private fun linkMainNote(chat: ChatEntity, throughMessageId: UUID) {
        val note = noteRepository.save(NoteEntity(chat.userId, "Body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Main"))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), chat.userId, throughMessageId, main = true))
    }

    private fun message(chat: ChatEntity, role: ChatMessageRole, content: String): ChatMessageEntity =
        chatMessageRepository.save(ChatMessageEntity(chat.id, role, content, ChatMessageStatus.COMPLETE))
}
