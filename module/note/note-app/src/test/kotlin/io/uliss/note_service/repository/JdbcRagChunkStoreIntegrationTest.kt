package io.uliss.note_service.repository

import io.uliss.note_service.config.TestContainersConfiguration
import io.uliss.note_service.model.NoteEntity
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import kotlin.test.assertEquals

@Tag("integration")
@SpringBootTest
@Import(TestContainersConfiguration::class)
@Transactional
class JdbcRagChunkStoreIntegrationTest {

    @Autowired
    lateinit var store: JdbcRagChunkStore

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Test
    fun `search isolates users and orders chunks above the similarity threshold`() {
        val userId = UUID.randomUUID()
        val otherUserId = UUID.randomUUID()
        val note = saveNote(userId)
        val otherNote = saveNote(otherUserId)
        store.replace(
            userId,
            note.id,
            listOf(
                chunk(0, "exact", 1.0f, 0.0f),
                chunk(1, "close", 0.8f, 0.6f),
                chunk(2, "below threshold", 0.0f, 1.0f),
            ),
        )
        store.replace(otherUserId, otherNote.id, listOf(chunk(0, "other user's exact", 1.0f, 0.0f)))

        val result = store.search(userId, vector(1.0f, 0.0f), limit = 10, minSimilarity = 0.7)

        assertEquals(listOf("exact", "close"), result.map { it.content })
        assertEquals(listOf(note.id, note.id), result.map { it.noteId })
    }

    @Test
    fun `replace removes previous chunks of the selected note`() {
        val userId = UUID.randomUUID()
        val note = saveNote(userId)
        store.replace(
            userId,
            note.id,
            listOf(chunk(0, "old first", 1.0f, 0.0f), chunk(1, "old second", 0.0f, 1.0f)),
        )

        store.replace(userId, note.id, listOf(chunk(0, "new", 1.0f, 0.0f)))

        assertEquals(listOf("new"), contents(note.id))
    }

    @Test
    fun `different notes can have chunks with the same index`() {
        val userId = UUID.randomUUID()
        val firstNote = saveNote(userId)
        val secondNote = saveNote(userId)

        store.replace(userId, firstNote.id, listOf(chunk(0, "first", 1.0f, 0.0f)))
        store.replace(userId, secondNote.id, listOf(chunk(0, "second", 0.0f, 1.0f)))

        assertEquals(listOf("first"), contents(firstNote.id))
        assertEquals(listOf("second"), contents(secondNote.id))
    }

    @Test
    fun `deleting a note cascades to its chunks`() {
        val userId = UUID.randomUUID()
        val note = saveNote(userId)
        store.replace(userId, note.id, listOf(chunk(0, "content", 1.0f, 0.0f)))

        noteRepository.delete(note)
        noteRepository.flush()

        assertEquals(0, chunkCount(note.id))
    }

    private fun saveNote(userId: UUID): NoteEntity =
        noteRepository.saveAndFlush(NoteEntity(userId = userId, content = "note"))

    private fun contents(noteId: UUID): List<String?> = jdbcTemplate.queryForList(
        "SELECT content FROM note.rag_chunks WHERE note_id = ? ORDER BY chunk_index",
        String::class.java,
        noteId,
    )

    private fun chunk(index: Int, content: String, first: Float, second: Float) = EmbeddedChunk(
        index = index,
        content = content,
        metadata = mapOf("source" to "integration-test"),
        embedding = vector(first, second),
    )

    private fun vector(first: Float, second: Float): FloatArray = FloatArray(1_536).apply {
        this[0] = first
        this[1] = second
    }

    private fun chunkCount(noteId: UUID): Int = jdbcTemplate.queryForObject(
        "SELECT count(*) FROM note.rag_chunks WHERE note_id = ?",
        Int::class.java,
        noteId,
    ) ?: 0
}
