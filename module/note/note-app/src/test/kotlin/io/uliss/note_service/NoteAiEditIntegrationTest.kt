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
import io.uliss.note_service.service.NoteService
import org.hamcrest.Matchers
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.post
import reactor.core.publisher.Flux
import java.util.UUID
import kotlin.test.assertEquals

class NoteAiEditIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate


    @Test
    fun `a rewrite streams the model's text and leaves the stored note untouched`() {
        val userId = UUID.randomUUID()
        val note = readyNote(userId)
        val version = noteRepository.findById(note.id).orElseThrow().version
        stubModel(Flux.just("## Fixed", "\n\nbody"))

        aiEdit(userId, note.id).asyncDispatch().andExpect {
            status { isOk() }
            content {
                contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM)
                string(Matchers.containsString("event:append\ndata:{\"text\":\"## Fixed\"}\n\n"))
                string(Matchers.containsString("event:append\ndata:{\"text\":\"\\n\\nbody\"}\n\n"))
                string(Matchers.endsWith("event:done\ndata:\n\n"))
            }
        }

        val stored = noteRepository.findById(note.id).orElseThrow()
        assertEquals("body", stored.content)
        assertEquals(version, stored.version)
        assertEquals(0, indexRequests(note.id))
    }

    @Test
    fun `a foreign note is indistinguishable from a missing one`() {
        val note = readyNote(UUID.randomUUID())

        aiEdit(UUID.randomUUID(), note.id).andExpect { status { isNotFound() } }
        Mockito.verifyNoInteractions(chatClient)
    }

    @Test
    fun `a rewrite is refused while a summary update of the note is pending`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        val covered = message(chat, "covered")
        val note = readyNote(userId)
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id), covered.id))
        noteService.requestChatSummaryUpdate(userId, chat.id, note.id, covered.id, message(chat, "new").id, UUID.randomUUID())

        aiEdit(userId, note.id).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_UPDATING") }
        }
        Mockito.verifyNoInteractions(chatClient)
    }

    private fun stubModel(tokens: Flux<String>) {
        val request = Mockito.mock(ChatClient.ChatClientRequestSpec::class.java)
        val stream = Mockito.mock(ChatClient.StreamResponseSpec::class.java)
        Mockito.`when`(chatClient.prompt()).thenReturn(request)
        Mockito.`when`(request.system(Mockito.anyString())).thenReturn(request)
        Mockito.`when`(request.user(Mockito.anyString())).thenReturn(request)
        Mockito.`when`(request.options(anyValue<OpenAiChatOptions.Builder>())).thenReturn(request)
        Mockito.`when`(request.stream()).thenReturn(stream)
        Mockito.`when`(stream.content()).thenReturn(tokens)
    }

    private fun aiEdit(userId: UUID, noteId: UUID): ResultActionsDsl = mockMvc.post("/note/notes/$noteId/ai-edit") {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
        contentType = MediaType.APPLICATION_JSON
        header("Accept", "text/event-stream, application/json")
        content = """{"instruction":"Fix the heading","content":"## Fxied\n\nbody"}"""
    }

    private fun readyNote(userId: UUID): NoteEntity =
        noteRepository.save(NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY, "Title"))

    private fun message(chat: ChatEntity, content: String): ChatMessageEntity = chatMessageRepository.save(
        ChatMessageEntity(chat.id, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE),
    )

    private fun indexRequests(noteId: UUID): Int = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM note.outbox_event WHERE type = 'NOTE_INDEX_REQUESTED' AND payload ->> 'noteId' = ?",
        Int::class.java,
        noteId.toString(),
    ) ?: 0
}
