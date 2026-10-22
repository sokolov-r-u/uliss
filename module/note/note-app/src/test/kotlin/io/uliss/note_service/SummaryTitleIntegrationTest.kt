package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.service.NoteSummaryService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals

class SummaryTitleIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate


    private val userId = UUID.randomUUID()

    @Test
    fun `a named summary note carries its title while generating and keeps it when the summary is saved`() {
        val noteId = noteIdOf(summarize(chat(), """{"title":"  Giant   Steps "}""").andExpect {
            status { isAccepted() }
            jsonPath("$.status") { value("GENERATING") }
        })

        mockMvc.get("/note/notes/$noteId") { auth() }.andExpect {
            jsonPath("$.status") { value("GENERATING") }
            jsonPath("$.title") { value("Giant Steps") }
        }

        noteSummaryService.completeChatSummary(userId, noteId, "Model title", "Coltrane changed everything.")

        val note = checkNotNull(noteRepository.findByIdAndUserId(noteId, userId))
        assertEquals(NoteStatus.READY, note.status)
        assertEquals("Giant Steps", note.title)
    }

    @Test
    fun `a blank title leaves the note for the model to name`() {
        val noteId = noteIdOf(summarize(chat(), """{"title":"   "}""").andExpect { status { isAccepted() } })

        mockMvc.get("/note/notes/$noteId") { auth() }.andExpect { jsonPath("$.title") { doesNotExist() } }
    }

    @Test
    fun `a replay with another title returns the original note with its original title`() {
        val chatId = chat()
        val key = UUID.randomUUID()
        val noteId = noteIdOf(summarize(chatId, """{"title":"Giant Steps"}""", key))

        val replayed = noteIdOf(summarize(chatId, """{"title":"Blue Train"}""", key).andExpect {
            status { isAccepted() }
        })

        assertEquals(noteId, replayed)
        mockMvc.get("/note/notes/$noteId") { auth() }.andExpect { jsonPath("$.title") { value("Giant Steps") } }
        assertEquals(1, summaryEvents(chatId))
    }

    @Test
    fun `a title over 50 characters is refused before anything is reserved`() {
        val chatId = chat()

        summarize(chatId, """{"title":"${"a".repeat(51)}"}""").andExpect { status { isBadRequest() } }

        assertEquals(0, count("SELECT count(*) FROM note.notes WHERE user_id = ?"))
        assertEquals(0, count("SELECT count(*) FROM note.summary_request WHERE user_id = ?"))
        assertEquals(0, summaryEvents(chatId))
    }

    @Test
    fun `an update refuses a title`() {
        val chatId = chat()

        summarize(chatId, """{"mode":"UPDATE","targetNoteId":"${UUID.randomUUID()}","title":"Giant Steps"}""")
            .andExpect { status { isBadRequest() } }

        assertEquals(0, count("SELECT count(*) FROM note.summary_request WHERE user_id = ?"))
    }

    private fun chat(): UUID {
        val chat = chatRepository.save(ChatEntity(userId, "Summary chat"))
        chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "A thought worth keeping", ChatMessageStatus.COMPLETE)
        )
        return chat.id
    }

    private fun summarize(chatId: UUID, body: String, key: UUID = UUID.randomUUID()): ResultActionsDsl =
        mockMvc.post("/note/chats/$chatId/summarize") {
            auth()
            header("Idempotency-Key", key)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun noteIdOf(result: ResultActionsDsl): UUID =
        UUID.fromString(objectMapper.readTree(result.andReturn().response.contentAsString).get("noteId").asString())

    private fun summaryEvents(chatId: UUID): Int = outboxEventRepository.findAll()
        .count { it.type == OutboxEventType.NOTE_SUMMARY_REQUESTED && it.payload.contains(chatId.toString()) }

    private fun count(sql: String): Int = jdbcTemplate.queryForObject(sql, Int::class.java, userId) ?: 0

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
