package io.uliss.note_service

import io.uliss.database.outbox.OutboxEventStatus
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.model.OutboxEventEntity
import io.uliss.note_service.model.payload.NoteIndexRequestedPayload
import io.uliss.note_service.outbox.OutboxEventType
import io.uliss.note_service.repository.NoteRepository
import io.uliss.note_service.service.handler.NoteIndexRequestedHandler
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.document.Document
import org.springframework.ai.embedding.BatchingStrategy
import org.springframework.ai.embedding.EmbeddingOptions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import tools.jackson.databind.ObjectMapper
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class NoteIndexPlaceIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var handler: NoteIndexRequestedHandler

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    private val userId = UUID.randomUUID()

    @Test
    fun `every chunk of a placed note's index starts with its constellation path and title`() {
        Mockito.`when`(
            embeddingModel.embed(anyValue<List<Document>>(), anyValue<EmbeddingOptions>(), anyValue<BatchingStrategy>())
        ).thenAnswer { invocation -> invocation.getArgument<List<Document>>(0).map { FloatArray(1536) { 0.01f } } }
        val music = constellation("""{"name":"Music"}""")
        val jazz = constellation("""{"name":"Jazz","parentId":"$music"}""")
        val content = (1..400).joinToString(" ") { "Sentence number $it about modal harmony." }
        val note = noteRepository.saveAndFlush(NoteEntity(userId, content, title = "Giant Steps")).id
        add(note, jazz)

        handler.handle(event(note))

        val chunks = jdbcTemplate.queryForList(
            "SELECT content FROM note.rag_chunks WHERE note_id = ? ORDER BY chunk_index",
            String::class.java,
            note,
        ).map { requireNotNull(it) }
        assertTrue(chunks.size > 1, "expected several chunks, got ${chunks.size}")
        chunks.forEach {
            assertTrue(it.startsWith("Constellations: Music / Jazz\nTitle: Giant Steps\n\n"), it)
        }
        assertEquals(1, chunks.count { "Sentence number 1 about" in it })
    }

    private fun event(noteId: UUID) = OutboxEventEntity(
        type = OutboxEventType.NOTE_INDEX_REQUESTED,
        payload = objectMapper.writeValueAsString(NoteIndexRequestedPayload(noteId, userId)),
        status = OutboxEventStatus.PROCESSING,
        attempts = 1,
        nextAttemptAt = Instant.now(),
        lastError = null,
    )

    private fun constellation(body: String): UUID {
        val response = mockMvc.post("/note/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = body
        }.andExpect { status { isCreated() } }.andReturn().response.contentAsString
        return UUID.fromString(objectMapper.readTree(response).get("id").asString())
    }

    private fun add(noteId: UUID, constellationId: UUID) {
        mockMvc.post("/note/notes/$noteId/constellations") {
            auth()
            contentType = MediaType.APPLICATION_JSON
            content = """{"constellationId":"$constellationId"}"""
        }.andExpect { status { isOk() } }
    }

    private fun MockHttpServletRequestDsl.auth() {
        with(jwt().jwt { it.claim("userId", userId.toString()) })
    }
}
