package io.uliss.note_service

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals

class NotePosterIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `a saved poster link comes back with the note`() {
        val note = note("Note")

        mockMvc.put("/note/notes/${note.id}/poster") {
            asUser()
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"https://example.com/poster.jpg"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(note.id.toString()) }
            jsonPath("$.posterUrl") { value("https://example.com/poster.jpg") }
        }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect {
            jsonPath("$.posterUrl") { value("https://example.com/poster.jpg") }
        }
    }

    @Test
    fun `a link that is not https, or a blank one, is refused and the note keeps its poster`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/kept.jpg").andExpect { status { isOk() } }

        listOf("http://example.com/p.jpg", "javascript:alert(1)", "   ", "https://user:pw@example.com/p.jpg").forEach {
            putPoster(note.id, it).andExpect { status { isBadRequest() } }
        }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect {
            jsonPath("$.posterUrl") { value("https://example.com/kept.jpg") }
        }
    }

    @Test
    fun `a link as a browser writes it, with a pipe in the query and an underscore in the host, is saved as sent`() {
        val note = note("Note")
        val link = "https://my_bucket.cdn.example.com/img[1].jpg?fit=crop|center"

        putPoster(note.id, link).andExpect {
            status { isOk() }
            jsonPath("$.posterUrl") { value(link) }
        }
    }

    @Test
    fun `removing the poster clears it, and removing it again still succeeds`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/p.jpg").andExpect { status { isOk() } }

        repeat(2) {
            mockMvc.delete("/note/notes/${note.id}/poster") { asUser() }.andExpect { status { isNoContent() } }
        }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect { jsonPath("$.posterUrl") { doesNotExist() } }
    }

    @Test
    fun `someone else's note is not found and keeps its poster`() {
        val other = UUID.randomUUID()
        val theirs = note("Theirs", other)
        putPoster(theirs.id, "https://example.com/theirs.jpg", other).andExpect { status { isOk() } }

        putPoster(theirs.id, "https://example.com/mine.jpg").andExpect { status { isNotFound() } }
        mockMvc.delete("/note/notes/${theirs.id}/poster") { asUser() }.andExpect { status { isNotFound() } }

        mockMvc.get("/note/notes/${theirs.id}") { asUser(other) }.andExpect {
            jsonPath("$.posterUrl") { value("https://example.com/theirs.jpg") }
        }
    }

    @Test
    fun `setting and removing the poster leaves the note's change time and version, so an open edit still saves`() {
        val note = note("Note")
        val changed = Instant.parse("2026-11-01T10:00:00Z")
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(changed), note.id)
        val version = version(note.id)

        putPoster(note.id, "https://example.com/p.jpg").andExpect { status { isOk() } }
        mockMvc.delete("/note/notes/${note.id}/poster") { asUser() }.andExpect { status { isNoContent() } }
        putPoster(note.id, "https://example.com/q.jpg").andExpect { status { isOk() } }

        assertEquals(changed, jdbcTemplate.queryForObject(
            "SELECT updated_at FROM note.notes WHERE id = ?", Timestamp::class.java, note.id)?.toInstant())
        assertEquals(version, version(note.id))
        mockMvc.put("/note/notes/${note.id}") {
            asUser()
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("title" to "Renamed", "content" to "body", "version" to version))
        }.andExpect {
            status { isOk() }
            jsonPath("$.posterUrl") { value("https://example.com/q.jpg") }
        }
    }

    @Test
    fun `the note list carries the poster link`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/p.jpg").andExpect { status { isOk() } }

        mockMvc.get("/note/notes") { asUser() }.andExpect {
            jsonPath("$.items[0].id") { value(note.id.toString()) }
            jsonPath("$.items[0].posterUrl") { value("https://example.com/p.jpg") }
        }
    }

    private fun version(id: UUID): Long? =
        jdbcTemplate.queryForObject("SELECT version FROM note.notes WHERE id = ?", Long::class.java, id)

    private fun putPoster(noteId: UUID, url: String, owner: UUID = userId) =
        mockMvc.put("/note/notes/$noteId/poster") {
            asUser(owner)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("url" to url))
        }

    private fun note(title: String, owner: UUID = userId) =
        noteRepository.save(NoteEntity(owner, "body", title = title))

    private fun MockHttpServletRequestDsl.asUser(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }
}
