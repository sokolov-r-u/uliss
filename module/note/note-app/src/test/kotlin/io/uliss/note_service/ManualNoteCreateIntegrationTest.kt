package io.uliss.note_service

import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import com.jayway.jsonpath.JsonPath
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.MvcResult
import java.nio.charset.StandardCharsets
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

class ManualNoteCreateIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `creating a note stores a ready manual note without a place and requests its index`() {
        val userId = UUID.randomUUID()

        val id = post(userId, UUID.randomUUID(), """{"title":" My  note ","content":"## Part\n\nbody\n","icon":"🎷"}""")
            .andExpect {
                status { isCreated() }
                jsonPath("$.title") { value("My note") }
                jsonPath("$.content") { value("## Part\n\nbody") }
                jsonPath("$.icon") { value("🎷") }
                jsonPath("$.source") { value("MANUAL") }
                jsonPath("$.status") { value("READY") }
                jsonPath("$.version") { value(0) }
            }
            .andReturn().noteId()

        val stored = noteRepository.findById(id).orElseThrow()
        assertEquals(userId, stored.userId)
        assertEquals(NoteSource.MANUAL, stored.source)
        assertEquals(NoteStatus.READY, stored.status)
        assertNull(stored.parentNoteId)
        assertEquals(userId.toString(), stored.createdBy)
        assertEquals(0, memberships(id))
        assertEquals(1, indexRequests(userId, id))
    }

    @Test
    fun `a retry with the same key and body returns the same note and creates no second one`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val first = post(userId, key, BODY).andExpect { status { isCreated() } }.andReturn().noteId()

        val retry = post(userId, key, """{"title":"Title ","content":"body\n"}""")
            .andExpect { status { isCreated() } }.andReturn().noteId()

        assertEquals(first, retry)
        assertEquals(1, notesOf(userId))
        assertEquals(1, indexRequests(userId, first))
    }

    @Test
    fun `a retry with the same key and another body is refused with the created note id`() {
        val userId = UUID.randomUUID()
        val key = UUID.randomUUID()
        val first = post(userId, key, BODY).andExpect { status { isCreated() } }.andReturn().noteId()

        post(userId, key, """{"title":"Title","content":"edited body"}""").andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            jsonPath("$.details.noteId") { value(first.toString()) }
        }

        assertEquals("body", noteRepository.findById(first).orElseThrow().content)
        assertEquals(1, notesOf(userId))
    }

    @Test
    fun `the same key of another user creates that user's own note`() {
        val key = UUID.randomUUID()
        val first = post(UUID.randomUUID(), key, BODY).andExpect { status { isCreated() } }.andReturn().noteId()

        val other = post(UUID.randomUUID(), key, BODY).andExpect { status { isCreated() } }.andReturn().noteId()

        assertNotEquals(first, other)
    }

    @Test
    fun `a body breaking the note rules is a bad request and creates nothing`() {
        val userId = UUID.randomUUID()

        post(userId, UUID.randomUUID(), """{"title":"   ","content":"body"}""").andExpect { status { isBadRequest() } }
        post(userId, UUID.randomUUID(), """{"title":"${"a".repeat(51)}","content":"body"}""")
            .andExpect { status { isBadRequest() } }
        post(userId, UUID.randomUUID(), """{"title":"Title","content":" \n "}""").andExpect { status { isBadRequest() } }
        post(userId, UUID.randomUUID(), """{"title":"Title","content":"body","icon":"🎷🎺"}""")
            .andExpect { status { isBadRequest() } }

        assertEquals(0, notesOf(userId))
    }

    @Test
    fun `a missing or malformed idempotency key is a bad request`() {
        val userId = UUID.randomUUID()

        mockMvc.post("/note/notes") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = BODY
        }.andExpect { status { isBadRequest() } }
        mockMvc.post("/note/notes") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", "not-a-uuid")
            contentType = MediaType.APPLICATION_JSON
            content = BODY
        }.andExpect { status { isBadRequest() } }

        assertEquals(0, notesOf(userId))
    }

    @Test
    fun `an anonymous request is unauthorized`() {
        mockMvc.post("/note/notes") {
            header("Idempotency-Key", UUID.randomUUID().toString())
            contentType = MediaType.APPLICATION_JSON
            content = BODY
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `a created note is listed first and among the notes without a constellation`() {
        val userId = UUID.randomUUID()
        val id = post(userId, UUID.randomUUID(), BODY).andExpect { status { isCreated() } }.andReturn().noteId()

        mockMvc.get("/note/notes") { with(jwt().jwt { it.claim("userId", userId.toString()) }) }.andExpect {
            status { isOk() }
            jsonPath("$.items[0].id") { value(id.toString()) }
        }
        mockMvc.get("/note/notes/without-constellation") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(id.toString()) }
        }
    }

    private fun notesOf(userId: UUID): Int = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM note.notes WHERE user_id = ?",
        Int::class.java,
        userId,
    ) ?: 0

    private fun post(userId: UUID, key: UUID, body: String): ResultActionsDsl =
        mockMvc.post("/note/notes") {
            with(jwt().jwt { it.claim("userId", userId.toString()) })
            header("Idempotency-Key", key.toString())
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun MvcResult.noteId(): UUID =
        UUID.fromString(JsonPath.read<String>(response.getContentAsString(StandardCharsets.UTF_8), "$.id"))

    private fun memberships(noteId: UUID): Int = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM note.note_constellation WHERE note_id = ?",
        Int::class.java,
        noteId,
    ) ?: 0

    private fun indexRequests(userId: UUID, noteId: UUID): Int = jdbcTemplate.queryForObject(
        """
            SELECT COUNT(*)
            FROM note.outbox_event
            WHERE type = 'NOTE_INDEX_REQUESTED'
              AND payload ->> 'userId' = ?
              AND payload ->> 'noteId' = ?
        """.trimIndent(),
        Int::class.java,
        userId.toString(),
        noteId.toString(),
    ) ?: 0

    private companion object {
        const val BODY = """{"title":"Title","content":"body"}"""
    }
}
