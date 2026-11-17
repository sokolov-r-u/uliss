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
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.util.ChatPrompts
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AbstractMessage
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.messages.SystemMessage
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
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ChatContextTurnIntegrationTest : NoteIntegrationTest() {

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

    private val requestSpec = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
    private val sentMessages = mutableListOf<List<Message>>()

    private fun provider(vararg replies: Flux<ChatResponse>) {
        val streamResponseSpec = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.system(ChatPrompts.CHAT_SYSTEM_PROMPT)).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.messages(anyValue<List<Message>>())).thenAnswer {
            sentMessages += it.getArgument<List<Message>>(0)
            requestSpec
        }
        Mockito.`when`(requestSpec.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.tools(anyValue<Any>())).thenReturn(requestSpec)
        Mockito.`when`(requestSpec.stream()).thenReturn(streamResponseSpec)
        Mockito.`when`(streamResponseSpec.chatResponse()).thenReturn(replies.first(), *replies.drop(1).toTypedArray())
    }

    private fun text(vararg chunks: String): Flux<ChatResponse> =
        Flux.fromArray(chunks).map { ChatResponse(listOf(Generation(AssistantMessage(it)))) }

    private fun send(userId: UUID, chatId: UUID, content: String) {
        mockMvc.post("/note/chats/$chatId/messages") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", UUID.randomUUID())
            contentType = MediaType.APPLICATION_JSON
            this.content = """{"content":"$content"}"""
        }.asyncDispatch()
    }

    @Test
    fun `a summarized chat sends its notes, the overlap through the boundary and the tail instead of its history`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Bowie"))
        val early = (1..8).map { message(chat, if (it % 2 == 1) ChatMessageRole.USER else ChatMessageRole.ASSISTANT, "early $it") }
        val tail = message(chat, ChatMessageRole.USER, "after the note")
        linkNote(chat, "Bowie", "Loves Low.", early.last().id, main = true)
        linkNote(chat, "Blackstar", "The last album.", early.last().id)
        provider(text("Answer"))

        send(userId, chat.id, "Tell me more")

        val messages = sentMessages.single()
        val notes = assertIs<SystemMessage>(messages.first()).text.orEmpty()
        assertTrue(notes.contains("Loves Low.") && notes.contains("The last album."))
        assertTrue(notes.indexOf("Bowie") < notes.indexOf("Blackstar"))
        assertEquals(
            (early.drop(2).map { it.content } + tail.content + "Tell me more"),
            messages.drop(1).map { (it as AbstractMessage).text },
        )
    }

    @Test
    fun `a chat whose main note is gone sends its whole history without notes`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Deleted"))
        val early = (1..8).map { message(chat, ChatMessageRole.USER, "early $it") }
        linkNote(chat, "Branch", "A branch.", early.last().id)
        provider(text("Answer"))

        send(userId, chat.id, "Tell me more")

        val messages = sentMessages.single()
        assertTrue(messages.none { it is SystemMessage })
        assertEquals(early.map { it.content } + "Tell me more", messages.map { (it as AbstractMessage).text })
    }

    @Test
    fun `a retry after a summary covered the failed reply sends the notes and keeps the question`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Retry"))
        provider(Flux.error(IllegalStateException("provider down")), text("Answer"))
        send(userId, chat.id, "Question")
        val failed = chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id).last()
        linkNote(chat, "Main", "Main body.", failed.id, main = true)

        mockMvc.post("/note/chats/${chat.id}/turns/${failed.turnId}/retry") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            param("messageId", failed.id.toString())
        }.asyncDispatch()

        val messages = sentMessages.last()
        assertTrue(assertIs<SystemMessage>(messages.first()).text.orEmpty().contains("Main body."))
        assertEquals(listOf("Question"), messages.drop(1).map { (it as AbstractMessage).text })
    }

    private fun message(chat: ChatEntity, role: ChatMessageRole, content: String): ChatMessageEntity =
        chatMessageRepository.save(ChatMessageEntity(chat.id, role, content, ChatMessageStatus.COMPLETE))

    private fun linkNote(chat: ChatEntity, title: String, content: String, throughMessageId: UUID, main: Boolean = false) {
        val note = noteRepository.save(NoteEntity(chat.userId, content, NoteSource.CHAT_SUMMARY, NoteStatus.READY, title))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), chat.userId, throughMessageId, main))
    }
}
