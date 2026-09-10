package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.outbox.OutboxEventRepository
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import org.hamcrest.Matchers
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
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

    @Test
    fun `summary request persists placeholder link and outbox event before returning 202`() {
        val userId = UUID.randomUUID()
        val chat = chatRepository.save(ChatEntity(userId, "Contract chat"))
        val message = chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "Summarize this", ChatMessageStatus.COMPLETE)
        )

        val result = mockMvc.post("/note/chats/${chat.id}/summarize") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isAccepted() }
            jsonPath("$.chatId") { value(chat.id.toString()) }
            jsonPath("$.status") { value("GENERATING") }
            jsonPath("$.content") { doesNotExist() }
        }.andReturn()

        val location = assertNotNull(result.response.getHeader("Location"))
        val noteId = UUID.fromString(location.substringAfterLast('/'))
        assertEquals("/note/notes/$noteId", location)

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
                jsonPath("$.details") { isEmpty() }
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
}
