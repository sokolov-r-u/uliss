package io.uliss.note_service.service

import io.uliss.note_service.anyValue
import io.uliss.note_service.captorFor
import io.uliss.note_service.captureValue
import io.uliss.note_service.repository.EmbeddedChunk
import io.uliss.note_service.repository.JdbcRagChunkStore
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.ai.document.Document
import org.springframework.ai.embedding.BatchingStrategy
import org.springframework.ai.embedding.EmbeddingModel
import org.springframework.ai.embedding.EmbeddingOptions
import org.springframework.ai.embedding.TokenCountBatchingStrategy
import org.springframework.ai.tokenizer.JTokkitTokenCountEstimator
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class RagServiceTest {

    private val store = Mockito.mock(JdbcRagChunkStore::class.java)
    private val userId = UUID.randomUUID()
    private val noteId = UUID.randomUUID()

    /** One embedding per document, or [missing] fewer, as a provider that dropped some would answer. */
    private fun embeddingModel(missing: Int = 0): EmbeddingModel {
        val model = Mockito.mock(EmbeddingModel::class.java)
        Mockito.`when`(model.embed(anyValue<List<Document>>(), anyValue<EmbeddingOptions>(), anyValue<BatchingStrategy>()))
            .thenAnswer { invocation ->
                val documents = invocation.getArgument<List<Document>>(0)
                List(documents.size - missing) { floatArrayOf(it.toFloat()) }
            }
        return model
    }

    private fun service(model: EmbeddingModel, chunkSize: Int = 20) =
        RagService(model, TokenCountBatchingStrategy(), store, chunkSize)

    @Test
    fun `a long note is split into chunks numbered in order, each with its own embedding`() {
        val text = (1..60).joinToString(" ") { "sentence number $it about the note." }

        service(embeddingModel()).index(userId, noteId, 3, "", text)

        val captor = captorFor<List<EmbeddedChunk>>(List::class.java)
        Mockito.verify(store).replace(Mockito.eq(userId) ?: userId, Mockito.eq(noteId) ?: noteId, Mockito.eq(3L), captor.captureValue())
        val chunks = captor.value
        assertEquals((0 until chunks.size).toList(), chunks.map { it.index })
        assertEquals(chunks.indices.map { it.toFloat() }, chunks.map { it.embedding.single() })
        assertEquals(true, chunks.size > 1, "expected several chunks, got ${chunks.size}")
    }

    @Test
    fun `an embedding count that does not match the chunks stores nothing`() {
        val text = (1..60).joinToString(" ") { "sentence number $it about the note." }

        assertFailsWith<IllegalStateException> { service(embeddingModel(missing = 1)).index(userId, noteId, 3, "", text) }

        Mockito.verifyNoInteractions(store)
    }

    @Test
    fun `every chunk starts with the header, and the header counts toward the chunk size`() {
        val text = (1..60).joinToString(" ") { "sentence number $it about the note." }
        val header = "Constellations: Music / Jazz\nTitle: Giant Steps"

        service(embeddingModel(), chunkSize = 40).index(userId, noteId, 3, header, text)

        val chunks = storedChunks()
        assertTrue(chunks.size > 1, "expected several chunks, got ${chunks.size}")
        val tokens = JTokkitTokenCountEstimator()
        // the separator may merge with a neighbouring token, so the bound allows two tokens either way
        chunks.forEach {
            assertTrue(it.content.startsWith("$header\n\n"), it.content)
            assertTrue(tokens.estimate(it.content) <= 40 + 2, "${tokens.estimate(it.content)}: ${it.content}")
        }
    }

    @Test
    fun `without a header the chunks are the note text alone`() {
        service(embeddingModel()).index(userId, noteId, 3, "", "A short note.")

        assertEquals(listOf("A short note."), storedChunks().map { it.content })
    }

    private fun storedChunks(): List<EmbeddedChunk> {
        val captor = captorFor<List<EmbeddedChunk>>(List::class.java)
        Mockito.verify(store).replace(Mockito.eq(userId) ?: userId, Mockito.eq(noteId) ?: noteId, Mockito.eq(3L), captor.captureValue())
        return captor.value
    }
}
