package io.uliss.note_service

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.NoteStatus
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
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.util.UUID

@Tag("integration")
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestContainersConfiguration::class)
class SkyApiIntegrationTest {

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
    private val otherUserId = UUID.randomUUID()

    @Test
    fun `the sky holds the tree and the ready notes with their places, sub-notes under their parents`() {
        val music = constellation("""{"name":"Music"}""")
        val rock = constellation("""{"name":"Rock","parentId":"$music"}""")
        val films = constellation("""{"name":"Films"}""")
        val bowie = note("Bowie")
        val low = note("Low")
        val loose = note("Loose thought")
        note(null, NoteStatus.GENERATING)
        add(bowie, rock)
        add(bowie, films)
        moveUnder(low, bowie)

        mockMvc.get("/note/sky") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.constellations.length()") { value(3) }
            jsonPath("$.constellations[?(@.name == 'Rock')].parentId") { value(music.toString()) }
            jsonPath("$.constellations[?(@.name == 'Music')].noteCount") { value(2) }
            jsonPath("$.notes.length()") { value(3) }
            jsonPath("$.notes[0].id") { value(bowie.toString()) }
            jsonPath("$.notes[0].title") { value("Bowie") }
            jsonPath("$.notes[0].createdAt") { exists() }
            jsonPath("$.notes[0].parentNoteId") { doesNotExist() }
            jsonPath("$.notes[0].memberships[0].constellationId") { value(rock.toString()) }
            jsonPath("$.notes[0].memberships[0].main") { value(true) }
            jsonPath("$.notes[0].memberships[1].constellationId") { value(films.toString()) }
            jsonPath("$.notes[0].memberships[1].main") { value(false) }
            jsonPath("$.notes[1].id") { value(low.toString()) }
            jsonPath("$.notes[1].parentNoteId") { value(bowie.toString()) }
            jsonPath("$.notes[1].memberships.length()") { value(0) }
            jsonPath("$.notes[2].id") { value(loose.toString()) }
            jsonPath("$.notes[2].memberships.length()") { value(0) }
            jsonPath("$.notes[?(@.content)]") { isEmpty() }
        }
    }

    @Test
    fun `a sub-note of a note being written takes its top note's place`() {
        val rock = constellation("""{"name":"Rock"}""")
        val bowie = note("Bowie")
        val low = note("Low")
        add(bowie, rock)
        moveUnder(low, bowie)
        jdbcTemplate.update("UPDATE note.notes SET status = 'GENERATING' WHERE id = ?", bowie)

        mockMvc.get("/note/sky") { auth() }.andExpect {
            jsonPath("$.notes.length()") { value(1) }
            jsonPath("$.notes[0].id") { value(low.toString()) }
            jsonPath("$.notes[0].parentNoteId") { doesNotExist() }
            jsonPath("$.notes[0].memberships[0].constellationId") { value(rock.toString()) }
        }
    }

    @Test
    fun `another user's notes and constellations never reach the sky, an empty sky is empty`() {
        noteRepository.saveAndFlush(NoteEntity(otherUserId, "body", title = "Foreign"))
        mockMvc.post("/note/constellations") {
            with(jwt().jwt { it.claim("userId", otherUserId.toString()) })
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Foreign"}"""
        }.andExpect { status { isCreated() } }

        mockMvc.get("/note/sky") { auth() }.andExpect {
            status { isOk() }
            jsonPath("$.constellations.length()") { value(0) }
            jsonPath("$.notes.length()") { value(0) }
        }
    }

    @Test
    fun `the sky needs a signed-in user`() {
        mockMvc.get("/note/sky").andExpect { status { isUnauthorized() } }
    }

    private fun constellation(body: String): UUID {
        val response = mockMvc.post("/note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return UUID.fromString(objectMapper.readTree(response).get("id").asString())
    }

    private fun note(title: String?, status: NoteStatus = NoteStatus.READY): UUID =
        noteRepository.saveAndFlush(NoteEntity(userId, "body", status = status, title = title)).id

    private fun add(noteId: UUID, constellationId: UUID) {
        mockMvc.post("/note/notes/$noteId/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }.andExpect { status { is2xxSuccessful() } }
    }

    private fun moveUnder(noteId: UUID, parentId: UUID) {
        mockMvc.put("/note/notes/$noteId/parent") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"parentNoteId":"$parentId"}"""
        }.andExpect { status { isOk() } }
    }

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
