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
            jsonPath("$.poster.url") { value("https://example.com/poster.jpg") }
        }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect {
            jsonPath("$.poster.url") { value("https://example.com/poster.jpg") }
        }
    }

    @Test
    fun `a poster saved with its crop comes back with both frames`() {
        val note = note("Note")
        val crop = mapOf(
            "poster" to mapOf("x" to 0.1, "y" to 0.0, "w" to 0.6, "h" to 0.6),
            "avatar" to mapOf("x" to 0.25, "y" to 0.2, "w" to 0.5, "h" to 0.3333),
        )

        putPoster(note.id, "https://example.com/poster.jpg", crop = crop).andExpect {
            status { isOk() }
            jsonPath("$.poster.crop.poster.x") { value(0.1) }
        }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect {
            jsonPath("$.poster.url") { value("https://example.com/poster.jpg") }
            jsonPath("$.poster.crop.poster.w") { value(0.6) }
            jsonPath("$.poster.crop.avatar.x") { value(0.25) }
            jsonPath("$.poster.crop.avatar.h") { value(0.3333) }
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
            jsonPath("$.poster.url") { value("https://example.com/kept.jpg") }
        }
    }

    @Test
    fun `a link as a browser writes it, with a pipe in the query and an underscore in the host, is saved as sent`() {
        val note = note("Note")
        val link = "https://my_bucket.cdn.example.com/img[1].jpg?fit=crop|center"

        putPoster(note.id, link).andExpect {
            status { isOk() }
            jsonPath("$.poster.url") { value(link) }
        }
    }

    @Test
    fun `removing the poster clears it, and removing it again still succeeds`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/p.jpg").andExpect { status { isOk() } }

        repeat(2) {
            mockMvc.delete("/note/notes/${note.id}/poster") { asUser() }.andExpect { status { isNoContent() } }
        }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect { jsonPath("$.poster") { doesNotExist() } }
    }

    @Test
    fun `someone else's note is not found and keeps its poster`() {
        val other = UUID.randomUUID()
        val theirs = note("Theirs", other)
        putPoster(theirs.id, "https://example.com/theirs.jpg", other).andExpect { status { isOk() } }

        putPoster(theirs.id, "https://example.com/mine.jpg").andExpect { status { isNotFound() } }
        mockMvc.delete("/note/notes/${theirs.id}/poster") { asUser() }.andExpect { status { isNotFound() } }

        mockMvc.get("/note/notes/${theirs.id}") { asUser(other) }.andExpect {
            jsonPath("$.poster.url") { value("https://example.com/theirs.jpg") }
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
            jsonPath("$.poster.url") { value("https://example.com/q.jpg") }
        }
    }

    @Test
    fun `the note list leaves posters out, only a single note carries one`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/p.jpg").andExpect { status { isOk() } }

        mockMvc.get("/note/notes") { asUser() }.andExpect {
            jsonPath("$.items[0].id") { value(note.id.toString()) }
            jsonPath("$.items[0].poster") { doesNotExist() }
        }
    }

    @Test
    fun `a link saved without a crop replaces the frames with the defaults`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/p.jpg", crop = crop()).andExpect { status { isOk() } }

        putPoster(note.id, "https://example.com/q.jpg").andExpect {
            status { isOk() }
            jsonPath("$.poster.url") { value("https://example.com/q.jpg") }
            jsonPath("$.poster.crop") { value(null as Any?) }
        }
    }

    @Test
    fun `a crop with a frame outside the image, a missing frame or a missing value is refused and the poster stays`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/kept.jpg", crop = crop()).andExpect { status { isOk() } }
        val outside = mapOf("x" to 0.6, "y" to 0.0, "w" to 0.5, "h" to 0.5)
        val noW = mapOf("x" to 0.0, "y" to 0.0, "h" to 0.5)
        val fine = mapOf("x" to 0.0, "y" to 0.0, "w" to 0.5, "h" to 0.5)

        listOf(
            mapOf("poster" to outside, "avatar" to fine),
            mapOf("poster" to fine, "avatar" to noW),
            mapOf("poster" to fine),
        ).forEach {
            putPoster(note.id, "https://example.com/other.jpg", crop = it).andExpect { status { isBadRequest() } }
        }
        mockMvc.put("/note/notes/${note.id}/poster") {
            asUser()
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"https://example.com/other.jpg","crop":{"poster":{"x":0,"y":0,"w":1e400,"h":0.5},"avatar":{"x":0,"y":0,"w":0.5,"h":0.5}}}"""
        }.andExpect { status { isBadRequest() } }

        mockMvc.get("/note/notes/${note.id}") { asUser() }.andExpect {
            jsonPath("$.poster.url") { value("https://example.com/kept.jpg") }
            jsonPath("$.poster.crop.poster.x") { value(0.1) }
        }
    }

    @Test
    fun `deleting a note deletes its poster`() {
        val note = note("Note")
        putPoster(note.id, "https://example.com/p.jpg").andExpect { status { isOk() } }

        mockMvc.delete("/note/notes/${note.id}") { asUser() }.andExpect { status { is2xxSuccessful() } }

        assertEquals(0, jdbcTemplate.queryForObject(
            "SELECT count(*) FROM note.note_posters WHERE note_id = ?", Int::class.java, note.id))
    }

    private fun crop() = mapOf(
        "poster" to mapOf("x" to 0.1, "y" to 0.0, "w" to 0.6, "h" to 0.6),
        "avatar" to mapOf("x" to 0.25, "y" to 0.2, "w" to 0.5, "h" to 0.3333),
    )

    private fun version(id: UUID): Long? =
        jdbcTemplate.queryForObject("SELECT version FROM note.notes WHERE id = ?", Long::class.java, id)

    private fun putPoster(noteId: UUID, url: String, owner: UUID = userId, crop: Any? = null) =
        mockMvc.put("/note/notes/$noteId/poster") {
            asUser(owner)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("url" to url, "crop" to crop))
        }

    private fun note(title: String, owner: UUID = userId) =
        noteRepository.save(NoteEntity(owner, "body", title = title))

    private fun MockHttpServletRequestDsl.asUser(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }
}
