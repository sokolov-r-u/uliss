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
import java.time.Duration
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
        val edited = note(hoursAgo(2))
        val other = note(hoursAgo(1))

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
        val edited = note(hoursAgo(2))
        val other = note(hoursAgo(1))
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

    @Test
    fun `a constellation filter pages through its subtree with sub-notes and counts both lists`() {
        val music = constellation("Music", null)
        val rock = constellation("Rock", music)
        val films = constellation("Films", null)
        val bowie = place(note(Instant.parse("2026-11-03T10:00:00Z")), rock)
        val album = note(Instant.parse("2026-11-03T09:00:00Z"))
        mockMvc.put("/note/notes/$album/parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"$bowie"}"""
        }.andExpect { status { isOk() } }
        val jazz = place(note(Instant.parse("2026-11-03T08:00:00Z")), music)
        val film = place(note(Instant.parse("2026-11-03T07:00:00Z")), films)
        note(Instant.parse("2026-11-03T06:00:00Z"))

        val musicPages = walk(limit = 2, filter = "&constellationId=$music")
        val both = walk(limit = 10, filter = "&constellationId=$music&constellationId=$films").single()

        assertEquals(listOf(bowie, album, jazz), musicPages.flatMap { it.ids })
        assertEquals(listOf(3 to 5, 3 to 5), musicPages.map { it.total to it.allTotal })
        assertEquals(listOf(bowie, album, jazz, film), both.ids)
        assertEquals(4 to 5, both.total to both.allTotal)
    }

    private fun constellation(name: String, parentId: UUID?): UUID =
        mockMvc.post("/note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name"${parentId?.let { ""","parentId":"$it"""" } ?: ""}}"""
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
            .let { UUID.fromString(JsonPath.read(it, "$.id")) }

    private fun place(noteId: UUID, constellationId: UUID): UUID {
        mockMvc.post("/note/notes/$noteId/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }.andExpect { status { is2xxSuccessful() } }
        return noteId
    }

    private data class Page(val ids: List<UUID>, val total: Int, val allTotal: Int)

    /** Follows `nextCursor` until it runs out; [filter] is appended to every request's query. */
    private fun walk(limit: Int, filter: String = ""): List<Page> {
        val pages = mutableListOf<Page>()
        var cursor: String? = null
        do {
            val body = mockMvc.get("/note/notes?limit=$limit$filter" + (cursor?.let { "&cursor=$it" } ?: "")) {
                auth()
            }.andExpect { status { isOk() } }.andReturn().response.contentAsString
            pages += Page(
                JsonPath.read<List<String>>(body, "$.items[*].id").map(UUID::fromString),
                JsonPath.read(body, "$.total"),
                JsonPath.read(body, "$.allTotal"),
            )
            cursor = JsonPath.read<String?>(body, "$.nextCursor")
        } while (cursor != null)
        return pages
    }

    private fun org.springframework.test.web.servlet.MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }

    /** An edit stamps the wall clock, so the notes it must overtake are dated relative to it. */
    private fun hoursAgo(hours: Long): Instant = Instant.now().minus(Duration.ofHours(hours))

    private fun note(updatedAt: Instant): UUID {
        val id = noteRepository.save(NoteEntity(userId, "body")).id
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(updatedAt), id)
        return id
    }
}
