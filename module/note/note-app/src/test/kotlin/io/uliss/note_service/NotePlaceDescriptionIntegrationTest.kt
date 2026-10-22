package io.uliss.note_service

import io.uliss.exception.common.NotFoundException
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.NoteHierarchyService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import tools.jackson.databind.ObjectMapper
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class NotePlaceDescriptionIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var service: NoteHierarchyService


    private val userId = UUID.randomUUID()

    @Test
    fun `a top note in several constellations is described by every full path, main first`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val bebop = constellation("""{"name":"Bebop","parentId":"$jazz"}""")
        val cinema = constellation("""{"name":"Cinema"}""")
        val note = note("Giant Steps")
        add(note, cinema)
        add(note, bebop)

        val description = service.getPlaceDescription(userId, note)

        assertEquals(listOf(listOf("Cinema"), listOf("Music", "Jazz", "Bebop")), description.constellationPaths)
        assertTrue(description.parentNoteTitles.isEmpty())
    }

    @Test
    fun `a note two levels under a note inherits its top note's paths and lists its parents from the top down`() {
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val history = note("Jazz history")
        val coltrane = note("Coltrane")
        val giantSteps = note("Giant Steps")
        add(history, jazz)
        moveUnder(coltrane, history)
        moveUnder(giantSteps, coltrane)

        val description = service.getPlaceDescription(userId, giantSteps)

        assertEquals(listOf(listOf("Music", "Jazz")), description.constellationPaths)
        assertEquals(listOf("Jazz history", "Coltrane"), description.parentNoteTitles)
    }

    @Test
    fun `a note without a place has an empty description, and a foreign note is not found`() {
        val note = note("Loose")

        val description = service.getPlaceDescription(userId, note)

        assertTrue(description.constellationPaths.isEmpty() && description.parentNoteTitles.isEmpty())
        assertFailsWith<NotFoundException> { service.getPlaceDescription(UUID.randomUUID(), note) }
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

    private fun add(noteId: UUID, constellationId: UUID) {
        mockMvc.post("/note/notes/$noteId/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }.andExpect { status { isOk() } }
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
