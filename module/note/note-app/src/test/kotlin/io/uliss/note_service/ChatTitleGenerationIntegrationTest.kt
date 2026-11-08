package io.uliss.note_service

import io.uliss.note_service.model.ChatTitleSource
import io.uliss.note_service.repository.ChatRepository
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
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ChatTitleGenerationIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var chatRepository: ChatRepository

    private val userId = UUID.randomUUID()

    /** One request spec serves both calls: the reply streams, the title is a plain call. */
    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)

    private fun provider(title: String) {
        val streamSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        val callSpec = Mockito.mock(ChatClient.CallResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.user(anyValue<String>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamSpec)
        Mockito.`when`(streamSpec.chatResponse()).thenAnswer {
            Flux.just(ChatResponse(listOf(Generation(AssistantMessage("Hi there")))))
        }
        Mockito.`when`(requestSpec.call()).thenReturn(callSpec)
        Mockito.`when`(callSpec.content()).thenReturn(title)
    }

    private fun startChat(idempotencyKey: UUID, content: String) =
        mockMvc.post("/note/chats") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", idempotencyKey)
            contentType = MediaType.APPLICATION_JSON
            this.content = """{"content":"$content"}"""
        }.asyncDispatch().andReturn().response

    @Test
    fun `a new chat streams its generated title with the first reply and stores it`() {
        provider("Drop D tuning")

        val response = startChat(UUID.randomUUID(), "How do I tune my guitar to drop D?")

        val body = response.contentAsString
        assertTrue(body.contains("event:done"))
        assertTrue(body.contains("event:title\ndata:{\"title\":\"Drop D tuning\"}\n\n"))
        val chat = chatRepository.findById(UUID.fromString(response.getHeader("Chat-Id"))).orElseThrow()
        assertEquals("Drop D tuning", chat.title)
        assertEquals(ChatTitleSource.GENERATED, chat.titleSource)
    }

    @Test
    fun `a replayed initial request and a later message never ask for a title again`() {
        provider("Drop D tuning")
        val idempotencyKey = UUID.randomUUID()
        val chatId = startChat(idempotencyKey, "Drop D?").getHeader("Chat-Id")
        Mockito.verify(requestSpec, Mockito.times(1)).call()

        val replayed = startChat(idempotencyKey, "Drop D?").contentAsString
        val next = mockMvc.post("/note/chats/$chatId/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
            contentType = MediaType.APPLICATION_JSON
            content = """{"content":"And drop C?"}"""
        }.asyncDispatch().andReturn().response.contentAsString

        assertFalse(replayed.contains("event:title"))
        assertFalse(next.contains("event:title"))
        Mockito.verify(requestSpec, Mockito.times(1)).call()
    }

    @Test
    fun `without a usable title the chat keeps its first-message title and the stream ends normally`() {
        provider("   ")

        val response = startChat(UUID.randomUUID(), "How do I tune my guitar to drop D?")

        assertTrue(response.contentAsString.contains("event:done"))
        assertFalse(response.contentAsString.contains("event:title"))
        val chat = chatRepository.findById(UUID.fromString(response.getHeader("Chat-Id"))).orElseThrow()
        assertEquals("How do I tune my guitar to drop D?", chat.title)
        assertEquals(ChatTitleSource.FIRST_MESSAGE, chat.titleSource)
    }
}
