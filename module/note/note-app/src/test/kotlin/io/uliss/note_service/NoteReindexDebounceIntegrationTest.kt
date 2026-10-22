package io.uliss.note_service

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteSource
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.repository.OutboxEventRepository
import io.uliss.note_service.service.NoteSummaryService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val REINDEX_DELAY: Duration = Duration.ofHours(1)

/** Which notes each change reindexes, and when; events of other tests are told apart by note id. */
class NoteReindexDebounceIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var outboxEventRepository: OutboxEventRepository

    @Autowired
    lateinit var noteSummaryService: NoteSummaryService

    private val userId = UUID.randomUUID()

    @Test
    fun `edits of a note leave one pending reindex, due an hour after the last edit`() {
        val note = note("Giant Steps")
        clearIndexEvents(note)

        edit(note, "Giant Steps", "first edit")
        val firstDue = pendingFor(note).nextAttemptAt
        val beforeSecond = Instant.now()
        edit(note, "Giant Steps", "second edit")

        val events = indexEventsFor(note)
        assertEquals(1, events.size)
        val event = events.single()
        assertEquals(OutboxEventStatus.PENDING, event.status)
        assertTrue(event.nextAttemptAt > firstDue, "${event.nextAttemptAt} after $firstDue")
        assertDueAfter(event, beforeSecond)
    }

    @Test
    fun `renaming a note reindexes it with its sub-notes, whose parent chain changed`() {
        val parent = note("Coltrane")
        val child = note("Giant Steps", parentId = parent)
        val other = note("Other")
        clearIndexEvents(parent, child, other)

        val before = Instant.now()
        mockMvc.patch("/note/notes/$parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"John Coltrane"}"""
        }.andExpect { status { isOk() } }

        assertDueAfter(pendingFor(parent), before)
        assertDueAfter(pendingFor(child), before)
        assertTrue(indexEventsFor(other).isEmpty())
    }

    @Test
    fun `adding, changing the main and removing a place reindex the note and its sub-notes once`() {
        val music = constellation("""{"name":"Music"}""")
        val films = constellation("""{"name":"Films"}""")
        val note = note("Giant Steps")
        val child = note("Solo", parentId = note)
        clearIndexEvents(note, child)

        val before = Instant.now()
        mockMvc.post("/note/notes/$note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$music"}"""
        }.andExpect { status { isOk() } }
        mockMvc.put("/note/notes/$note/constellations/main") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$films","replace":false}"""
        }.andExpect { status { isOk() } }
        mockMvc.delete("/note/notes/$note/constellations/$music") { auth() }.andExpect { status { isOk() } }

        assertEquals(1, indexEventsFor(note).size)
        assertEquals(1, indexEventsFor(child).size)
        assertDueAfter(pendingFor(note), before)
        assertDueAfter(pendingFor(child), before)
    }

    @Test
    fun `moving a note under a note and out again reindexes it with its sub-notes`() {
        val music = constellation("""{"name":"Music"}""")
        val parent = note("Coltrane")
        val note = note("Giant Steps")
        val child = note("Solo", parentId = note)
        clearIndexEvents(parent, note, child)

        mockMvc.put("/note/notes/$note/parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"$parent"}"""
        }.andExpect { status { isOk() } }
        assertEquals(1, indexEventsFor(note).size)
        assertEquals(1, indexEventsFor(child).size)
        val before = Instant.now()
        mockMvc.delete("/note/notes/$note/parent?moveTo=$music") { auth() }.andExpect { status { isOk() } }

        assertDueAfter(pendingFor(note), before)
        assertDueAfter(pendingFor(child), before)
        assertTrue(indexEventsFor(parent).isEmpty())
    }

    @Test
    fun `deleting a note but keeping its sub-notes reindexes them`() {
        val parent = note("Coltrane")
        val child = note("Giant Steps", parentId = parent)
        val grandchild = note("Solo", parentId = child)
        clearIndexEvents(parent, child, grandchild)

        mockMvc.delete("/note/notes/$parent?subNotes=KEEP") { auth() }.andExpect { status { isNoContent() } }

        assertEquals(1, indexEventsFor(child).size)
        assertEquals(1, indexEventsFor(grandchild).size)
    }

    @Test
    fun `renaming a constellation reindexes the notes of its branch with their sub-notes, a colour change nothing`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val films = constellation("""{"name":"Films"}""")
        val inJazz = placedNote("Giant Steps", jazz)
        val child = note("Solo", parentId = inJazz)
        val inFilms = placedNote("Stalker", films)
        clearIndexEvents(inJazz, child, inFilms)

        mockMvc.patch("/note/constellations/$music") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"hue":10}"""
        }.andExpect { status { isOk() } }
        mockMvc.patch("/note/constellations/$jazz") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"lightness":"DEEP"}"""
        }.andExpect { status { isOk() } }
        assertTrue(indexEventsFor(inJazz, child, inFilms).isEmpty())

        val before = Instant.now()
        mockMvc.patch("/note/constellations/$music") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Musique"}"""
        }.andExpect { status { isOk() } }

        assertDueAfter(pendingFor(inJazz), before)
        assertDueAfter(pendingFor(child), before)
        assertTrue(indexEventsFor(inFilms).isEmpty())
    }

    @Test
    fun `moving a constellation and deleting one with its notes moved reindex the notes of the branch`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val films = constellation("""{"name":"Films"}""")
        val inJazz = placedNote("Giant Steps", jazz)
        val inFilms = placedNote("Stalker", films)
        clearIndexEvents(inJazz, inFilms)

        mockMvc.post("/note/constellations/$jazz/move") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentId":"$films"}"""
        }.andExpect { status { isOk() } }
        assertEquals(1, indexEventsFor(inJazz).size)
        assertTrue(indexEventsFor(inFilms).isEmpty())

        clearIndexEvents(inJazz, inFilms)
        mockMvc.delete("/note/constellations/$films?moveTo=$music") { auth() }.andExpect { status { isNoContent() } }

        assertEquals(1, indexEventsFor(inJazz).size)
        assertEquals(1, indexEventsFor(inFilms).size)
    }

    @Test
    fun `a new summary note is indexed at once, its place set while generating adds no later reindex`() {
        val music = constellation("""{"name":"Music"}""")
        val note = noteRepository.saveAndFlush(
            NoteEntity(userId, null, NoteSource.CHAT_SUMMARY, NoteStatus.GENERATING)
        ).id
        clearIndexEvents(note)
        mockMvc.post("/note/notes/$note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$music"}"""
        }.andExpect { status { isOk() } }
        assertTrue(indexEventsFor(note).isEmpty())

        noteSummaryService.completeChatSummary(userId, note, "Giant Steps", "summary")

        val event = indexEventsFor(note).single()
        assertNull(event.dedupKey)
        assertTrue(event.nextAttemptAt <= Instant.now(), "${event.nextAttemptAt}")
    }

    private fun note(title: String, parentId: UUID? = null): UUID =
        noteRepository.saveAndFlush(NoteEntity(userId, "body", title = title, parentNoteId = parentId)).id

    private fun placedNote(title: String, constellationId: UUID): UUID {
        val note = note(title)
        mockMvc.post("/note/notes/$note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }.andExpect { status { isOk() } }
        return note
    }

    private fun edit(noteId: UUID, title: String, content: String) {
        val version = noteRepository.findById(noteId).orElseThrow().version
        mockMvc.put("/note/notes/$noteId") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            this.content = """{"title":"$title","content":"$content","version":$version}"""
        }.andExpect { status { isOk() } }
    }

    private fun constellation(body: String): UUID {
        val response = mockMvc.post("/note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return UUID.fromString(objectMapper.readTree(response).get("id").asString())
    }

    /** Drops the reindexes the setup queued, so a test sees only those of the change under test. */
    private fun clearIndexEvents(vararg noteIds: UUID) {
        outboxEventRepository.deleteAll(indexEventsFor(*noteIds))
    }

    private fun indexEventsFor(vararg noteIds: UUID): List<OutboxEventEntity> {
        val ids = noteIds.map { it.toString() }
        return outboxEventRepository.findAll().filter { event ->
            event.type == OutboxEventType.NOTE_INDEX_REQUESTED && ids.any { it in event.payload }
        }
    }

    private fun pendingFor(noteId: UUID): OutboxEventEntity {
        val event = indexEventsFor(noteId).single { it.status == OutboxEventStatus.PENDING }
        assertEquals("NOTE_INDEX_REQUESTED:$noteId", event.dedupKey)
        return event
    }

    private fun assertDueAfter(event: OutboxEventEntity, changedAfter: Instant) {
        assertTrue(event.nextAttemptAt >= changedAfter.plus(REINDEX_DELAY), "${event.nextAttemptAt} vs $changedAfter")
        assertTrue(event.nextAttemptAt <= Instant.now().plus(REINDEX_DELAY), "${event.nextAttemptAt}")
    }

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
