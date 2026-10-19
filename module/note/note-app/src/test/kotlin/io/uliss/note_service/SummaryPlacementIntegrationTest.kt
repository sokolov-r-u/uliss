package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.service.handler.NoteSummaryTerminalFailureHandler
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class SummaryPlacementIntegrationTest {

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
    lateinit var terminalFailureHandler: NoteSummaryTerminalFailureHandler

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var noteRepository: NoteRepository

    @MockitoBean
    lateinit var chatClient: ChatClient

    private val userId = UUID.randomUUID()

    @Test
    fun `a new summary note lies in the chosen constellation while it is still generating`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val chatId = chat()

        val noteId = noteIdOf(summarize(chatId, """{"constellationId":"$jazz"}""").andExpect {
            status { isAccepted() }
            jsonPath("$.status") { value("GENERATING") }
        })

        mockMvc.get("/note/notes/$noteId/constellations") { auth() }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].constellationId") { value(jazz.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        mockMvc.get("/note/constellations/$jazz/notes") { auth() }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(noteId.toString()) }
            jsonPath("$[0].status") { value("GENERATING") }
        }
        mockMvc.get("/note/constellations") { auth() }.andExpect {
            jsonPath("$[?(@.name == 'Music')].noteCount") { value(1) }
        }
        mockMvc.get("/note/notes/without-constellation") { auth() }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `a summary without a place waits under Without constellation`() {
        val noteId = noteIdOf(summarize(chat(), null).andExpect { status { isAccepted() } })

        mockMvc.get("/note/notes/without-constellation") { auth() }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(noteId.toString()) }
        }
    }

    @Test
    fun `a deleted or foreign constellation is refused before anything is reserved, and the key stays free`() {
        val deleted = constellation("""{"name":"Gone"}""")
        mockMvc.delete("/note/constellations/$deleted") { auth() }.andExpect { status { isNoContent() } }
        val foreign = constellation("""{"name":"Theirs"}""", owner = UUID.randomUUID())
        val chatId = chat()
        val key = UUID.randomUUID()

        for (refused in listOf(deleted, foreign)) {
            summarize(chatId, """{"constellationId":"$refused"}""", key).andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("CONSTELLATION_NOT_FOUND") }
            }
        }
        assertEquals(0, count("SELECT count(*) FROM note.notes WHERE user_id = ?"))
        assertEquals(0, count("SELECT count(*) FROM note.summary_request WHERE user_id = ?"))
        assertEquals(0, summaryEvents(chatId))

        summarize(chatId, null, key).andExpect { status { isAccepted() } }
        assertEquals(1, summaryEvents(chatId))
    }

    @Test
    fun `a replay returns the original note and keeps its place`() {
        val music = constellation("""{"name":"Music"}""")
        val films = constellation("""{"name":"Films"}""")
        val chatId = chat()
        val key = UUID.randomUUID()
        val noteId = noteIdOf(summarize(chatId, """{"constellationId":"$music"}""", key))

        val replayed = noteIdOf(summarize(chatId, """{"constellationId":"$films"}""", key).andExpect {
            status { isAccepted() }
        })

        assertEquals(noteId, replayed)
        mockMvc.get("/note/notes/$noteId/constellations") { auth() }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].constellationId") { value(music.toString()) }
        }
        assertEquals(1, summaryEvents(chatId))
    }

    @Test
    fun `a failed generation keeps the note in its place`() {
        val music = constellation("""{"name":"Music"}""")
        val chatId = chat()
        val noteId = noteIdOf(summarize(chatId, """{"constellationId":"$music"}"""))
        val event = outboxEventRepository.findAll().single {
            it.type == OutboxEventType.NOTE_SUMMARY_REQUESTED && it.payload.contains(noteId.toString())
        }

        terminalFailureHandler.handleTerminalFailure(event)

        mockMvc.get("/note/constellations/$music/notes") { auth() }.andExpect {
            jsonPath("$[0].id") { value(noteId.toString()) }
            jsonPath("$[0].status") { value("FAILED") }
        }
    }

    @Test
    fun `a new summary note is a sub-note of the chosen parent at once and lives in its place`() {
        val music = constellation("""{"name":"Music"}""")
        val parent = parentNote("Bowie")
        mockMvc.post("/note/notes/$parent/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$music"}"""
        }.andExpect { status { isOk() } }

        val noteId = noteIdOf(summarize(chat(), """{"parentNoteId":"$parent"}""").andExpect {
            status { isAccepted() }
        })

        mockMvc.get("/note/notes/$noteId/place") { auth() }.andExpect {
            jsonPath("$.ancestors[0].id") { value(parent.toString()) }
            jsonPath("$.constellations[0].constellationId") { value(music.toString()) }
        }
        mockMvc.get("/note/constellations") { auth() }.andExpect {
            jsonPath("$[?(@.name == 'Music')].noteCount") { value(2) }
        }
    }

    @Test
    fun `a deleted or foreign parent note is refused before anything is reserved, and both places at once are 400`() {
        val foreign = savedNote(UUID.randomUUID())
        val chatId = chat()

        summarize(chatId, """{"parentNoteId":"$foreign"}""").andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("PARENT_NOTE_NOT_FOUND") }
        }
        summarize(chatId, """{"parentNoteId":"${parentNote("Bowie")}","constellationId":"${constellation("""{"name":"Music"}""")}"}""")
            .andExpect { status { isBadRequest() } }
        assertEquals(1, count("SELECT count(*) FROM note.notes WHERE user_id = ?"))
        assertEquals(0, count("SELECT count(*) FROM note.summary_request WHERE user_id = ?"))
        assertEquals(0, summaryEvents(chatId))
    }

    @Test
    fun `an update refuses a place`() {
        val music = constellation("""{"name":"Music"}""")
        val chatId = chat()

        summarize(chatId, """{"mode":"UPDATE","targetNoteId":"${UUID.randomUUID()}","constellationId":"$music"}""")
            .andExpect { status { isBadRequest() } }
        assertEquals(0, summaryEvents(chatId))
    }

    private fun parentNote(title: String): UUID = savedNote(userId, title)

    private fun savedNote(owner: UUID, title: String = "Theirs"): UUID =
        noteRepository.saveAndFlush(NoteEntity(owner, "body", title = title)).id

    private fun chat(): UUID {
        val chat = chatRepository.save(ChatEntity(userId, "Summary chat"))
        chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "A thought worth keeping", ChatMessageStatus.COMPLETE)
        )
        return chat.id
    }

    private fun summarize(chatId: UUID, body: String?, key: UUID = UUID.randomUUID()): ResultActionsDsl =
        mockMvc.post("/note/chats/$chatId/summarize") {
            auth()
            header("Idempotency-Key", key)
            if (body != null) {
                contentType = MediaType.APPLICATION_JSON
                content = body
            }
        }

    private fun noteIdOf(result: ResultActionsDsl): UUID =
        UUID.fromString(objectMapper.readTree(result.andReturn().response.contentAsString).get("noteId").asString())

    private fun constellation(body: String, owner: UUID = userId): UUID {
        val response = mockMvc.post("/note/constellations") {
            auth(owner)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return UUID.fromString(objectMapper.readTree(response).get("id").asString())
    }

    private fun summaryEvents(chatId: UUID): Int = outboxEventRepository.findAll()
        .count { it.type == OutboxEventType.NOTE_SUMMARY_REQUESTED && it.payload.contains(chatId.toString()) }

    private fun count(sql: String): Int = jdbcTemplate.queryForObject(sql, Int::class.java, userId) ?: 0

    private fun MockHttpServletRequestDsl.auth(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }
}
