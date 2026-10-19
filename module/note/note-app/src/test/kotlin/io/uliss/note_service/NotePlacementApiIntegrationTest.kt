package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteRepository
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
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class NotePlacementApiIntegrationTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @MockitoBean
    lateinit var chatClient: ChatClient

    private val userId = UUID.randomUUID()

    @Test
    fun `places a note, changes its main place and counts it in the tree`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val films = constellation("""{"name":"Films"}""")
        val note = note("Kind of Blue")
        val loose = note("Loose thought")

        add(note, jazz).andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].constellationId") { value(jazz.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        // Music lies on Jazz's line: the place moves up instead of doubling.
        add(note, music).andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].constellationId") { value(music.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        mockMvc.get("/note/constellations") { auth() }.andExpect {
            jsonPath("$[?(@.name == 'Music')].noteCount") { value(1) }
            jsonPath("$[?(@.name == 'Music')].ownNoteCount") { value(1) }
            jsonPath("$[?(@.name == 'Jazz')].noteCount") { value(0) }
        }
        mockMvc.get("/note/constellations/$music/notes") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(note.toString()) }
            jsonPath("$[0].title") { value("Kind of Blue") }
        }
        mockMvc.get("/note/notes/without-constellation") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(loose.toString()) }
        }

        add(note, films).andExpect { jsonPath("$[1].constellationId") { value(films.toString()) } }
        main(note, """{"constellationId":"$films","replace":false}""").andExpect {
            jsonPath("$[0].constellationId") { value(films.toString()) }
            jsonPath("$[1].constellationId") { value(music.toString()) }
        }
        main(note, """{"constellationId":"$jazz","replace":true}""").andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].constellationId") { value(jazz.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        add(note, films)
        remove(note, jazz).andExpect {
            status { isOk() }
            jsonPath("$[0].constellationId") { value(films.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        mockMvc.get("/note/notes/$note/constellations") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
        }
    }

    @Test
    fun `deleting a branch reports and moves the notes that need it`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val films = constellation("""{"name":"Films"}""")
        val onlyJazz = note("Kind of Blue")
        val alsoFilms = note("Round Midnight")
        add(onlyJazz, jazz)
        add(alsoFilms, jazz)
        add(alsoFilms, films)

        mockMvc.get("/note/constellations/$jazz/deletion") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.notesToMove") { value(1) }
        }
        mockMvc.delete("/note/constellations/$jazz") {
            auth()
            param("moveTo", jazz.toString())
        }.andExpect { status { isBadRequest() } }
        mockMvc.delete("/note/constellations/$jazz") {
            auth()
            param("moveTo", music.toString())
        }.andExpect { status { isNoContent() } }

        mockMvc.get("/note/notes/$onlyJazz/constellations") { auth() }.andExpect {
            jsonPath("$[0].constellationId") { value(music.toString()) }
            jsonPath("$[0].main") { value(true) }
        }
        mockMvc.get("/note/notes/$alsoFilms/constellations") { auth() }.andExpect {
            jsonPath("$[0].constellationId") { value(films.toString()) }
            jsonPath("$.length()") { value(1) }
        }
        mockMvc.delete("/note/constellations/$music") { auth() }.andExpect { status { isNoContent() } }
        mockMvc.get("/note/notes/without-constellation") { auth() }.andExpect {
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(onlyJazz.toString()) }
        }
    }

    @Test
    fun `invalid bodies are bad requests`() {
        val note = note("Kind of Blue")

        post(note, """{}""").andExpect { status { isBadRequest() } }
        post(note, """{"constellationId":"not-a-uuid"}""").andExpect { status { isBadRequest() } }
        main(note, """{"replace":true}""").andExpect { status { isBadRequest() } }
        mockMvc.delete("/note/constellations/${UUID.randomUUID()}") {
            auth()
            param("moveTo", "nowhere")
        }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `foreign notes and constellations are not found, a sub-note is a conflict`() {
        val mine = constellation("""{"name":"Music"}""")
        val theirs = constellation("""{"name":"Theirs"}""", UUID.randomUUID())
        val note = note("Kind of Blue")
        val foreignNote = noteRepository.saveAndFlush(NoteEntity(UUID.randomUUID(), "body")).id
        val subNote = note("Low")
        jdbcTemplate.update("UPDATE note.notes SET parent_note_id = ? WHERE id = ?", note, subNote)

        add(note, theirs).andExpect { status { isNotFound() } }
        add(foreignNote, mine).andExpect { status { isNotFound() } }
        mockMvc.get("/note/notes/$foreignNote/constellations") { auth() }.andExpect { status { isNotFound() } }
        mockMvc.get("/note/constellations/$theirs/notes") { auth() }.andExpect { status { isNotFound() } }
        mockMvc.get("/note/constellations/$theirs/deletion") { auth() }.andExpect { status { isNotFound() } }
        mockMvc.delete("/note/constellations/$mine") {
            auth()
            param("moveTo", theirs.toString())
        }.andExpect { status { isNotFound() } }
        add(subNote, mine).andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("NOTE_PLACE_INHERITED") }
        }
    }

    @Test
    fun `requests without a token are unauthorized`() {
        val id = UUID.randomUUID()
        mockMvc.get("/note/notes/$id/constellations").andExpect { status { isUnauthorized() } }
        mockMvc.get("/note/notes/without-constellation").andExpect { status { isUnauthorized() } }
        mockMvc.get("/note/constellations/$id/notes").andExpect { status { isUnauthorized() } }
    }

    private fun constellation(body: String, owner: UUID = userId): UUID {
        val response = mockMvc.post("/note/constellations") {
            auth(owner)
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andReturn().response.contentAsString
        return UUID.fromString(objectMapper.readTree(response).get("id").asString())
    }

    private fun note(title: String): UUID = noteRepository.saveAndFlush(NoteEntity(userId, "body", title = title)).id

    private fun add(noteId: UUID, constellationId: UUID): ResultActionsDsl =
        post(noteId, """{"constellationId":"$constellationId"}""")

    private fun post(noteId: UUID, body: String): ResultActionsDsl =
        mockMvc.post("/note/notes/$noteId/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun main(noteId: UUID, body: String): ResultActionsDsl =
        mockMvc.put("/note/notes/$noteId/constellations/main") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }

    private fun remove(noteId: UUID, constellationId: UUID): ResultActionsDsl =
        mockMvc.delete("/note/notes/$noteId/constellations/$constellationId") { auth() }

    private fun MockHttpServletRequestDsl.auth(owner: UUID = userId) {
        with(jwt().jwt { it.claim("userId", owner.toString()) })
    }
}
