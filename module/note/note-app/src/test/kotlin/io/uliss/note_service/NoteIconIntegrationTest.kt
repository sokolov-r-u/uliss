package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.ChatMessageRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.NoteRepository
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
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class NoteIconIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatMessageRepository: ChatMessageRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `a summary note carries the user's icon while generating and keeps it when the summary is saved`() {
        val chatId = chat()
        val noteId = noteIdOf(summarize(chatId, """{"title":"Giant Steps","icon":" 👨‍👩‍👧 "}""").andExpect {
            status { isAccepted() }
        })

        mockMvc.get("/note/notes/$noteId") { auth() }.andExpect {
            jsonPath("$.status") { value("GENERATING") }
            jsonPath("$.icon") { value("👨‍👩‍👧") }
        }

        noteSummaryService.completeChatSummary(userId, noteId, null, "Coltrane changed everything.")

        assertEquals("👨‍👩‍👧", checkNotNull(noteRepository.findByIdAndUserId(noteId, userId)).icon)
        mockMvc.get("/note/chats/$chatId/messages") { auth() }.andExpect {
            jsonPath("$.summary.noteIcon") { value("👨‍👩‍👧") }
        }
        mockMvc.get("/note/chats/$chatId/notes") { auth() }.andExpect { jsonPath("$[0].icon") { value("👨‍👩‍👧") } }
    }

    @Test
    fun `a summary without an icon or with a blank one leaves the note without it`() {
        val plain = noteIdOf(summarize(chat(), """{"title":"Giant Steps"}"""))
        val blank = noteIdOf(summarize(chat(), """{"icon":"  "}"""))

        assertNull(checkNotNull(noteRepository.findByIdAndUserId(plain, userId)).icon)
        assertNull(checkNotNull(noteRepository.findByIdAndUserId(blank, userId)).icon)
    }

    @Test
    fun `a replay with another icon returns the original note with its original icon`() {
        val chatId = chat()
        val key = UUID.randomUUID()
        val noteId = noteIdOf(summarize(chatId, """{"icon":"🎷"}""", key))

        assertEquals(noteId, noteIdOf(summarize(chatId, """{"icon":"🎺"}""", key)))

        assertEquals("🎷", checkNotNull(noteRepository.findByIdAndUserId(noteId, userId)).icon)
    }

    @Test
    fun `a summary with text or two emoji as its icon is refused before anything is reserved`() {
        val chatId = chat()

        summarize(chatId, """{"icon":"jazz"}""").andExpect { status { isBadRequest() } }
        summarize(chatId, """{"icon":"🎷🎺"}""").andExpect { status { isBadRequest() } }

        assertEquals(0, count("SELECT count(*) FROM note.notes WHERE user_id = ?"))
        assertEquals(0, count("SELECT count(*) FROM note.summary_request WHERE user_id = ?"))
    }

    @Test
    fun `an update refuses an icon`() {
        summarize(chat(), """{"mode":"UPDATE","targetNoteId":"${UUID.randomUUID()}","icon":"🎷"}""")
            .andExpect { status { isBadRequest() } }

        assertEquals(0, count("SELECT count(*) FROM note.summary_request WHERE user_id = ?"))
    }

    @Test
    fun `an edit sets, changes and removes the icon`() {
        val note = readyNote(icon = null)

        put(note, """"icon":"👍🏽",""").andExpect {
            status { isOk() }
            jsonPath("$.icon") { value("👍🏽") }
        }
        put(note, """"icon":"🎷",""").andExpect { jsonPath("$.icon") { value("🎷") } }
        put(note, """"icon":null,""").andExpect {
            status { isOk() }
            jsonPath("$.icon") { doesNotExist() }
        }
        put(note, """"icon":"🎷",""")
        put(note, "").andExpect { jsonPath("$.icon") { doesNotExist() } }

        assertNull(noteRepository.findById(note.id).orElseThrow().icon)
    }

    @Test
    fun `an edit with an invalid icon is refused and keeps the stored note`() {
        val note = readyNote(icon = "🎷")

        put(note, """"icon":"a",""").andExpect { status { isBadRequest() } }
        put(note, """"icon":"🎷🎷",""").andExpect { status { isBadRequest() } }

        assertEquals("🎷", noteRepository.findById(note.id).orElseThrow().icon)
    }

    @Test
    fun `the icon comes with the note's name in lists, search, places and the sky`() {
        val parent = readyNote(icon = "📚", title = "Reading")
        val child = readyNote(icon = null, title = "Readings of Kafka")
        mockMvc.put("/note/notes/${child.id}/parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"${parent.id}"}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/note/notes") { auth() }.andExpect {
            jsonPath("$[?(@.id == '${parent.id}')].icon") { value("📚") }
        }
        mockMvc.get("/note/notes/${parent.id}/sub-notes") { auth() }.andExpect {
            jsonPath("$[0].id") { value(child.id.toString()) }
        }
        mockMvc.get("/note/notes/${child.id}/place") { auth() }.andExpect {
            jsonPath("$.ancestors[0].icon") { value("📚") }
        }
        mockMvc.get("/note/notes/search") {
            auth()
            param("q", "read")
        }.andExpect {
            jsonPath("$[?(@.id == '${parent.id}')].icon") { value("📚") }
            jsonPath("$[?(@.id == '${child.id}')].ancestors[0].icon") { value("📚") }
        }
        mockMvc.get("/note/sky") { auth() }.andExpect {
            jsonPath("$.notes[?(@.id == '${parent.id}')].icon") { value("📚") }
        }
    }

    private fun chat(): UUID {
        val chat = chatRepository.save(ChatEntity(userId, "Icon chat"))
        chatMessageRepository.save(
            ChatMessageEntity(chat.id, ChatMessageRole.USER, "A thought worth keeping", ChatMessageStatus.COMPLETE)
        )
        return chat.id
    }

    private fun readyNote(icon: String?, title: String = "Title"): NoteEntity = noteRepository.save(
        NoteEntity(userId, "body", NoteSource.MANUAL, NoteStatus.READY, title, icon = icon)
    )

    /** Saves the note's own title and content with [iconField] (a JSON member with its trailing comma, or nothing). */
    private fun put(note: NoteEntity, iconField: String): ResultActionsDsl {
        val stored = noteRepository.findById(note.id).orElseThrow()
        return mockMvc.put("/note/notes/${note.id}") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"${stored.title}",$iconField"content":"body","version":${stored.version}}"""
        }
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

    private fun count(sql: String): Int = jdbcTemplate.queryForObject(sql, Int::class.java, userId) ?: 0

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
