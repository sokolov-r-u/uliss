package io.uliss.note_service

import com.jayway.jsonpath.JsonPath
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NoteListPaginationIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `pages walk every note by last change once, and each page counts all the user's notes`() {
        val tie = Instant.parse("2026-11-03T10:00:00.123456Z")
        val tied = (1..3).map { note(tie) }
        val newest = note(tie.plusSeconds(60))
        val oldest = note(tie.minusSeconds(60))

        val pages = walk(limit = 2)

        val expected = listOf(newest) + tied.sortedByDescending { it.toString() } + listOf(oldest)
        assertEquals(expected, pages.flatMap { it.ids })
        assertEquals(listOf(5, 5, 5), pages.map { it.total })
    }

    @Test
    fun `an edited note comes first, created order no longer matters`() {
        val edited = note(Instant.parse("2026-11-03T08:00:00Z"))
        val other = note(Instant.parse("2026-11-03T09:00:00Z"))

        mockMvc.patch("/note/notes/$edited") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Renamed"}"""
        }.andExpect { status { isOk() } }

        assertEquals(listOf(edited, other), walk(limit = 10).single().ids)
    }

    @Test
    fun `moving a note under another keeps its place`() {
        val parent = note(Instant.parse("2026-11-03T09:00:00Z"))
        val moved = note(Instant.parse("2026-11-03T08:00:00Z"))

        mockMvc.put("/note/notes/$moved/parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"$parent"}"""
        }.andExpect { status { isOk() } }

        assertEquals(listOf(parent, moved), walk(limit = 10).single().ids)
    }

    @Test
    fun `saving new content and icon lifts the note`() {
        val edited = note(Instant.parse("2026-11-03T08:00:00Z"))
        val other = note(Instant.parse("2026-11-03T09:00:00Z"))
        val version = noteRepository.findById(edited).orElseThrow().version

        mockMvc.put("/note/notes/$edited") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Edited","content":"new body","icon":"🎷","version":$version}"""
        }.andExpect { status { isOk() } }

        assertEquals(listOf(edited, other), walk(limit = 10).single().ids)
    }

    @Test
    fun `adding a note to a constellation keeps its place`() {
        val other = note(Instant.parse("2026-11-03T09:00:00Z"))
        val placed = note(Instant.parse("2026-11-03T08:00:00Z"))
        val constellationId = mockMvc.post("/note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Music"}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
            .let { UUID.fromString(JsonPath.read(it, "$.id")) }

        mockMvc.post("/note/notes/$placed/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }.andExpect { status { is2xxSuccessful() } }

        assertEquals(listOf(other, placed), walk(limit = 10).single().ids)
    }

    @Test
    fun `a broken cursor, a time Postgres cannot bind and a limit out of range are bad requests`() {
        val farFuture = java.util.Base64.getUrlEncoder().withoutPadding()
            .encodeToString("${Long.MAX_VALUE}|${UUID.randomUUID()}".toByteArray())
        for (query in listOf("cursor=broken", "cursor=$farFuture", "limit=0", "limit=101")) {
            for (list in listOf("notes", "chats")) {
                val status = mockMvc.get("/note/$list?$query") { auth() }.andReturn().response.status
                assertTrue(status == 400, "$list?$query answered $status")
            }
        }
    }

    private data class Page(val ids: List<UUID>, val total: Int)

    /** Follows `nextCursor` until it runs out. */
    private fun walk(limit: Int): List<Page> {
        val pages = mutableListOf<Page>()
        var cursor: String? = null
        do {
            val body = mockMvc.get("/note/notes?limit=$limit" + (cursor?.let { "&cursor=$it" } ?: "")) {
                auth()
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString
            pages += Page(
                JsonPath.read<List<String>>(body, "$.items[*].id").map(UUID::fromString),
                JsonPath.read(body, "$.total"),
            )
            cursor = JsonPath.read<String?>(body, "$.nextCursor")
        } while (cursor != null)
        return pages
    }

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }

    private fun note(updatedAt: Instant): UUID {
        val id = noteRepository.save(NoteEntity(userId, "body")).id
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), id)
        return id
    }
}
