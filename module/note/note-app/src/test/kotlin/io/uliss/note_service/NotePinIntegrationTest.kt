package io.uliss.note_service

import io.uliss.note_service.exception.PinLimitReachedException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.NoteService
import io.uliss.note_service.util.PinLimit
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.TimeUnit
import kotlin.random.Random
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class NotePinIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var noteService: NoteService

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var objectMapper: ObjectMapper

    private val userId = UUID.randomUUID()

    @Test
    fun `a pinned note leaves the note pages, still counts in the total, and comes in the pinned list`() {
        val pinned = note("Pinned")
        val other = note("Other")

        mockMvc.put("/note/notes/${pinned.id}/pin") { asUser() }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(pinned.id.toString()) }
            jsonPath("$.pinnedAt") { isNotEmpty() }
        }

        mockMvc.get("/note/notes") { asUser() }.andExpect {
            jsonPath("$.items.length()") { value(1) }
            jsonPath("$.items[0].id") { value(other.id.toString()) }
            jsonPath("$.total") { value(2) }
        }
        mockMvc.get("/note/notes/pinned") { asUser() }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(pinned.id.toString()) }
        }
    }

    @Test
    fun `pinning a pinned note keeps its pin time, so it keeps its place`() {
        val note = note("Note")
        noteService.pinNote(userId, note.id)
        val first = pinnedAt(note.id)

        mockMvc.put("/note/notes/${note.id}/pin") { asUser() }.andExpect { status { isOk() } }

        assertEquals(first, pinnedAt(note.id))
    }

    @Test
    fun `pinning leaves the note's change time and version alone, so an open edit still saves`() {
        val note = note("Note")
        val changed = Instant.parse("2026-11-01T10:00:00Z")
        jdbcTemplate.update("UPDATE note.notes SET updated_at = ? WHERE id = ?", Timestamp.from(changed), note.id)
        val version = version(note.id)

        noteService.pinNote(userId, note.id)
        noteService.unpinNote(userId, note.id)
        noteService.pinNote(userId, note.id)

        assertEquals(changed, jdbcTemplate.queryForObject(
            "SELECT updated_at FROM note.notes WHERE id = ?", Timestamp::class.java, note.id)?.toInstant())
        assertEquals(version, version(note.id))
        mockMvc.put("/note/notes/${note.id}") {
            asUser()
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Edited","content":"new body","version":$version}"""
        }.andExpect { status { isOk() } }
        assertNotNull(pinnedAt(note.id), "a save of the note keeps its pin")
    }

    @Test
    fun `renaming a pinned note keeps it pinned`() {
        val note = note("Note")
        noteService.pinNote(userId, note.id)

        mockMvc.patch("/note/notes/${note.id}") {
            asUser()
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Renamed"}"""
        }.andExpect { status { isOk() } }

        assertNotNull(pinnedAt(note.id))
    }

    @Test
    fun `a note still being written can be pinned`() {
        val generating = noteRepository.save(NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING))

        mockMvc.put("/note/notes/${generating.id}/pin") { asUser() }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("GENERATING") }
        }
    }

    @Test
    fun `an unpinned note goes back to the pages, and unpinning an unpinned note is no error`() {
        val note = note("Note")
        noteService.pinNote(userId, note.id)

        repeat(2) {
            mockMvc.delete("/note/notes/${note.id}/pin") { asUser() }.andExpect { status { isNoContent() } }
        }

        assertNull(pinnedAt(note.id))
        mockMvc.get("/note/notes") { asUser() }.andExpect { jsonPath("$.items[0].id") { value(note.id.toString()) } }
        mockMvc.get("/note/notes/pinned") { asUser() }.andExpect { jsonPath("$.length()") { value(0) } }
    }

    @Test
    fun `the pinned list comes last pinned first`() {
        val notes = (1..3).map { note("Note $it") }
        notes.forEachIndexed { index, note ->
            noteService.pinNote(userId, note.id)
            jdbcTemplate.update("UPDATE note.notes SET pinned_at = ? WHERE id = ?",
                Timestamp.from(Instant.parse("2026-11-03T10:00:00Z").plusSeconds(index.toLong())), note.id)
        }

        mockMvc.get("/note/notes/pinned") { asUser() }.andExpect {
            jsonPath("$[*].id") { value(notes.reversed().map { it.id.toString() }) }
        }
    }

    @Test
    fun `a full pinned list refuses one more with 409 PIN_LIMIT_REACHED, but answers a pin of a pinned note`() {
        val pinned = (1..PinLimit.MAX).map { note("Pinned $it") }
        pinned.forEach { noteService.pinNote(userId, it.id) }
        val extra = note("Extra")

        mockMvc.put("/note/notes/${extra.id}/pin") { asUser() }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("PIN_LIMIT_REACHED") }
        }
        mockMvc.put("/note/notes/${pinned.first().id}/pin") { asUser() }.andExpect { status { isOk() } }

        assertNull(pinnedAt(extra.id))
        assertEquals(PinLimit.MAX, noteService.getPinnedNotes(userId).size)
    }

    @Test
    fun `the note limit is per user`() {
        val other = UUID.randomUUID()
        repeat(PinLimit.MAX) { noteService.pinNote(other, note("Other $it", other).id) }

        repeat(PinLimit.MAX) { noteService.pinNote(userId, note("Own $it").id) }

        assertEquals(PinLimit.MAX, noteService.getPinnedNotes(userId).size)
    }

    @Test
    fun `deleting a pinned note frees its place under the limit`() {
        val pinned = (1..PinLimit.MAX).map { note("Pinned $it") }
        pinned.forEach { noteService.pinNote(userId, it.id) }

        mockMvc.delete("/note/notes/${pinned.first().id}") { asUser() }.andExpect { status { isNoContent() } }

        mockMvc.put("/note/notes/${note("Next").id}/pin") { asUser() }.andExpect { status { isOk() } }
    }

    @Test
    fun `another user's note is not found for pin and unpin, and stays unpinned`() {
        val foreign = note("Foreign", UUID.randomUUID())

        mockMvc.put("/note/notes/${foreign.id}/pin") { asUser() }.andExpect { status { isNotFound() } }
        mockMvc.delete("/note/notes/${foreign.id}/pin") { asUser() }.andExpect { status { isNotFound() } }

        assertNull(pinnedAt(foreign.id))
    }

    @Test
    fun `two pins racing for the last place never make one more than the limit`() {
        repeat(PinLimit.MAX - 1) { noteService.pinNote(userId, note("Pinned $it").id) }
        val racers = (1..2).map { note("Racer $it") }
        val barrier = CyclicBarrier(racers.size)

        val outcomes = racers.map { racer ->
            CompletableFuture.supplyAsync {
                barrier.await(10, TimeUnit.SECONDS)
                runCatching { noteService.pinNote(userId, racer.id) }
            }
        }.map { it.get(30, TimeUnit.SECONDS) }

        assertEquals(1, outcomes.count { it.isSuccess })
        assertEquals(PinLimitReachedException::class, outcomes.single { it.isFailure }.exceptionOrNull()!!::class)
        assertEquals(PinLimit.MAX, noteService.getPinnedNotes(userId).size)
    }

    @Test
    fun `the pages and the pinned list together hold every note exactly once`() {
        // seeded subsets of pinned notes, walked page by page with a small page size
        repeat(5) { round ->
            val owner = UUID.randomUUID()
            val random = Random(round)
            val notes = (1..random.nextInt(1, 12)).map { note("Note $it", owner) }
            notes.shuffled(random).take(random.nextInt(0, notes.size + 1)).forEach { noteService.pinNote(owner, it.id) }

            val seen = pages(owner, pageSize = 3) + pinned(owner)

            assertEquals(notes.map { it.id }.sorted(), seen.sorted(), "round $round")
        }
    }

    private fun pages(owner: UUID, pageSize: Int): List<UUID> {
        val ids = mutableListOf<UUID>()
        var cursor: String? = null
        do {
            val query = "limit=$pageSize" + (cursor?.let { "&cursor=$it" } ?: "")
            val body = mockMvc.get("/note/notes?$query") { asUser(owner) }.andReturn().response.contentAsString
            val page = objectMapper.readTree(body)
            page["items"].forEach { ids += UUID.fromString(it["id"].asString()) }
            cursor = page["nextCursor"].takeUnless { it.isNull }?.asString()
        } while (cursor != null)
        return ids
    }

    private fun pinned(owner: UUID): List<UUID> {
        val body = mockMvc.get("/note/notes/pinned") { asUser(owner) }.andReturn().response.contentAsString
        val ids = mutableListOf<UUID>()
        objectMapper.readTree(body).forEach { ids += UUID.fromString(it["id"].asString()) }
        return ids
    }

    private fun note(title: String, owner: UUID = userId) =
        noteRepository.save(NoteEntity(owner, "body", title = title))

    private fun pinnedAt(id: UUID): Instant? =
        jdbcTemplate.queryForObject("SELECT pinned_at FROM note.notes WHERE id = ?", Timestamp::class.java, id)
            ?.toInstant()

    private fun version(id: UUID): Long? =
        jdbcTemplate.queryForObject("SELECT version FROM note.notes WHERE id = ?", Long::class.java, id)

    private fun MockHttpServletRequestDsl.asUser(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }
}
