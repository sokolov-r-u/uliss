package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.projection.RequestFingerprint
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.ChatTurnStore
import io.uliss.note_service.repository.EmbeddedChunk
import io.uliss.note_service.repository.JdbcRagChunkStore
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.queryForObject
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class ChatNoteRenameDeleteIntegrationTest {

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
    lateinit var chatTurnStore: ChatTurnStore

    @Autowired
    lateinit var ragChunkStore: JdbcRagChunkStore

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @MockitoBean
    lateinit var chatClient: ChatClient

    @Test
    fun `deleting a chat keeps its note and removes messages and the link`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        chatMessageRepository.save(ChatMessageEntity(chat.id, ChatMessageRole.USER, "hi", ChatMessageStatus.COMPLETE))
        val note = noteRepository.save(NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id)))

        mockMvc.get("/note/chats") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            jsonPath("$[0].noteCount") { value(1) }
        }

        mockMvc.delete("/note/chats/${chat.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isNoContent() } }

        assertFalse(chatRepository.existsById(chat.id))
        assertTrue(noteRepository.existsById(note.id))
        assertFalse(chatNoteRepository.existsById(ChatNoteId(chat.id, note.id)))
        assertEquals(0, chatMessageRepository.findByChatIdOrderByCreatedAtAscIdAsc(chat.id).size)
    }

    @Test
    fun `deleting a chat with a live generating turn returns 409 and keeps the chat`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Busy chat"))
        chatTurnStore.insert(
            turnId = UUID.randomUUID(),
            userId = userId,
            chatId = chat.id,
            idempotencyKey = UUID.randomUUID(),
            requestFingerprint = RequestFingerprint.from(ByteArray(32)),
            leaseMillis = 60_000,
        )

        mockMvc.delete("/note/chats/${chat.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isConflict() } }

        assertTrue(chatRepository.existsById(chat.id))
    }

    @Test
    fun `foreign chats and notes are indistinguishable from missing ones`() {
        val owner = UUID.randomUUID()
        val stranger = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(owner, "Private"))
        val note = noteRepository.save(NoteEntity(owner, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY))

        mockMvc.delete("/note/chats/${chat.id}") {
            with(jwt().jwt { it.claim("userId", stranger.toString()) })
        }.andExpect { status { isNotFound() } }
        mockMvc.delete("/note/notes/${note.id}") {
            with(jwt().jwt { it.claim("userId", stranger.toString()) })
        }.andExpect { status { isNotFound() } }

        assertTrue(chatRepository.existsById(chat.id))
        assertTrue(noteRepository.existsById(note.id))
    }

    @Test
    fun `deleting a note removes its rag chunks and keeps the chat`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        val note = noteRepository.save(NoteEntity(userId, "body", NoteSource.CHAT_SUMMARY, NoteStatus.READY))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, note.id)))
        ragChunkStore.replace(userId, note.id, listOf(EmbeddedChunk(0, "body", emptyMap(), FloatArray(1536) { 0.01f })))

        mockMvc.delete("/note/notes/${note.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect { status { isNoContent() } }

        assertFalse(noteRepository.existsById(note.id))
        assertTrue(chatRepository.existsById(chat.id))
        val chunks = jdbcTemplate.queryForObject<Long>(
            "SELECT COUNT(*) FROM note.rag_chunks WHERE note_id = ?",
            note.id,
        )
        assertEquals(0L, chunks)
    }

    @Test
    fun `renaming a chat stores a 50 code point title in the VARCHAR(50) column`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Old"))
        val title = "😀".repeat(50)

        mockMvc.patch("/note/chats/${chat.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"$title"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value(title) }
        }

        assertEquals(title, chatRepository.findById(chat.id).orElseThrow().title)
    }

    @Test
    fun `renaming a generating note returns 409`() {
        val userId = UUID.randomUUID()
        val note = noteRepository.save(NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING))

        mockMvc.patch("/note/notes/${note.id}") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"New"}"""
        }.andExpect { status { isConflict() } }
    }
}
