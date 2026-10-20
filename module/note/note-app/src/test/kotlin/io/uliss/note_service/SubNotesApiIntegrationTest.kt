package io.uliss.note_service

import io.uliss.note_service.model.ChatEntity
import io.uliss.note_service.model.ChatNoteEntity
import io.uliss.note_service.model.ChatNoteId
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.ChatNoteRepository
import io.uliss.note_service.repository.ChatRepository
import io.uliss.note_service.repository.EmbeddedChunk
import io.uliss.note_service.repository.JdbcRagChunkStore
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActionsDsl
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SubNotesApiIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var chatRepository: ChatRepository

    @Autowired
    lateinit var chatNoteRepository: ChatNoteRepository

    @Autowired
    lateinit var ragChunkStore: JdbcRagChunkStore

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate


    private val userId = UUID.randomUUID()

    @Test
    fun `an album moved under Bowie leaves its own place, lives in Rock and is counted, listed and found there`() {
        val music = constellation("""{"name":"Music"}""")
        val rock = constellation("""{"name":"Rock","parentId":"$music"}""")
        val films = constellation("""{"name":"Films"}""")
        val bowie = note("Bowie")
        val low = note("Low")
        add(bowie, rock)
        add(low, films)

        moveUnder(low, bowie).andExpect {
            status { isOk() }
            jsonPath("$.ancestors[0].id") { value(bowie.toString()) }
            jsonPath("$.ancestors[0].title") { value("Bowie") }
            jsonPath("$.constellations[0].constellationId") { value(rock.toString()) }
        }

        mockMvc.get("/note/notes/$low/constellations") { auth() }.andExpect { jsonPath("$.length()") { value(0) } }
        mockMvc.get("/note/constellations") { auth() }.andExpect {
            jsonPath("$[?(@.name == 'Music')].noteCount") { value(2) }
            jsonPath("$[?(@.name == 'Rock')].ownNoteCount") { value(2) }
            jsonPath("$[?(@.name == 'Films')].noteCount") { value(0) }
        }
        mockMvc.get("/note/constellations/$rock/notes") { auth() }.andExpect {
            jsonPath("$.length()") { value(2) }
            jsonPath("$[0].id") { value(low.toString()) }
            jsonPath("$[0].parentNoteId") { value(bowie.toString()) }
            jsonPath("$[1].parentNoteId") { doesNotExist() }
        }
        mockMvc.get("/note/notes/$bowie/sub-notes") { auth() }.andExpect {
            jsonPath("$[0].id") { value(low.toString()) }
        }
        mockMvc.get("/note/notes/search?q=LO") { auth() }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(low.toString()) }
            jsonPath("$[0].ancestors[0].title") { value("Bowie") }
            jsonPath("$[0].constellationId") { value(rock.toString()) }
        }
        // Moving Bowie, the album is not a target: it lies in Bowie's subtree.
        mockMvc.get("/note/notes/search?q=lo&exclude=$bowie") { auth() }.andExpect { jsonPath("$.length()") { value(0) } }
        // A sub-note's place is inherited.
        add(low, films).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_PLACE_INHERITED") }
        }
    }

    @Test
    fun `a note never moves under itself or its descendants, nor under a foreign or missing note`() {
        val bowie = note("Bowie")
        val low = note("Low")
        moveUnder(low, bowie).andExpect { status { isOk() } }

        for (target in listOf(bowie, low)) {
            moveUnder(bowie, target).andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("NOTE_MOVE_CYCLE") }
            }
        }
        val foreign = noteRepository.saveAndFlush(NoteEntity(UUID.randomUUID(), "theirs", title = "Theirs")).id
        moveUnder(bowie, foreign).andExpect {
            status { isNotFound() }
            jsonPath("$.code") { value("PARENT_NOTE_NOT_FOUND") }
        }
        moveUnder(foreign, bowie).andExpect { status { isNotFound() } }
        mockMvc.get("/note/notes/$foreign/place") { auth() }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `moving out puts the note in the chosen constellation or leaves it without a place`() {
        val films = constellation("""{"name":"Films"}""")
        val bowie = note("Bowie")
        val low = note("Low")
        val heroes = note("Heroes")
        moveUnder(low, bowie)
        moveUnder(heroes, bowie)

        mockMvc.delete("/note/notes/$low/parent?moveTo=$films") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.ancestors.length()") { value(0) }
            jsonPath("$.constellations[0].constellationId") { value(films.toString()) }
            jsonPath("$.constellations[0].main") { value(true) }
        }
        mockMvc.delete("/note/notes/$heroes/parent") { auth() }.andExpect { status { isOk() } }

        mockMvc.get("/note/notes/without-constellation") { auth() }.andExpect {
            jsonPath("$[?(@.id == '$heroes')].parentNoteId") { value(null) }
            jsonPath("$.length()") { value(2) }
        }
        mockMvc.delete("/note/notes/$heroes/parent?moveTo=${UUID.randomUUID()}") { auth() }
            .andExpect { status { isOk() } }
    }

    @Test
    fun `deleting a parent needs a choice, keeping its sub-notes gives them its place`() {
        val music = constellation("""{"name":"Music"}""")
        val bowie = note("Bowie")
        val low = note("Low")
        val warszawa = note("Warszawa")
        add(bowie, music)
        moveUnder(low, bowie)
        moveUnder(warszawa, low)

        mockMvc.delete("/note/notes/$bowie") { auth() }.andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_HAS_SUB_NOTES") }
        }
        mockMvc.delete("/note/notes/$bowie?subNotes=KEEP") { auth() }.andExpect { status { isNoContent() } }

        assertFalse(noteRepository.existsById(bowie))
        mockMvc.get("/note/notes/$low/constellations") { auth() }.andExpect {
            jsonPath("$[0].constellationId") { value(music.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        mockMvc.get("/note/notes/$warszawa/place") { auth() }.andExpect {
            jsonPath("$.ancestors[0].id") { value(low.toString()) }
        }
    }

    @Test
    fun `deleting all removes the subtree with its chat links and rag chunks, and the chats stay`() {
        val bowie = note("Bowie")
        val low = note("Low")
        val loose = note("Loose")
        moveUnder(low, bowie)
        val chat = chatRepository.save(ChatEntity(userId, "Chat"))
        chatNoteRepository.save(ChatNoteEntity(ChatNoteId(chat.id, low), chat.userId))
        ragChunkStore.replace(userId, low, 0, listOf(EmbeddedChunk(0, "body", emptyMap(), FloatArray(1536) { 0.01f })))

        mockMvc.delete("/note/notes/$bowie?subNotes=DELETE") { auth() }.andExpect { status { isNoContent() } }

        assertFalse(noteRepository.existsById(bowie))
        assertFalse(noteRepository.existsById(low))
        assertTrue(noteRepository.existsById(loose))
        assertTrue(chatRepository.existsById(chat.id))
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM note.rag_chunks WHERE note_id = ?", Int::class.java, low))
        assertEquals(0, jdbcTemplate.queryForObject("SELECT count(*) FROM note.chat_note WHERE note_id = ?", Int::class.java, low))
    }

    @Test
    fun `the sub-note endpoints need a token`() {
        mockMvc.get("/note/notes/search?q=a").andExpect { status { isUnauthorized() } }
        mockMvc.put("/note/notes/${UUID.randomUUID()}/parent").andExpect { status { isUnauthorized() } }
    }

    private fun constellation(body: String): UUID {
        val response = mockMvc.post("/note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return UUID.fromString(objectMapper.readTree(response).get("id").asString())
    }

    private fun note(title: String): UUID = noteRepository.saveAndFlush(NoteEntity(userId, "body", title = title)).id

    private fun add(noteId: UUID, constellationId: UUID): ResultActionsDsl =
        mockMvc.post("/note/notes/$noteId/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }

    private fun moveUnder(noteId: UUID, parentId: UUID): ResultActionsDsl =
        mockMvc.put("/note/notes/$noteId/parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"$parentId"}"""
        }

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
