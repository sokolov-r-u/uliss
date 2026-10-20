package io.uliss.note_service.service

import io.uliss.note_service.repository.EmbeddedChunk
import io.uliss.note_service.repository.JdbcRagChunkStore
import io.uliss.note_service.repository.RetrievedChunk
import org.springframework.ai.document.Document
import org.springframework.ai.embedding.BatchingStrategy
import org.springframework.ai.embedding.EmbeddingModel
import org.springframework.ai.embedding.EmbeddingOptions
import org.springframework.ai.transformer.splitter.TokenTextSplitter
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class RagService(
    private val embeddingModel: EmbeddingModel,
    private val batchingStrategy: BatchingStrategy,
    private val ragChunkStore: JdbcRagChunkStore,
    @Value($$"${note.rag.chunk-size:800}") private val chunkSize: Int,
) {

    fun index(userId: UUID, noteId: UUID, contentVersion: Long, content: String) {
        val documents = TokenTextSplitter.builder()
            .withChunkSize(chunkSize)
            .build()
            .apply(listOf(Document(content)))
        val embeddings = embeddingModel.embed(
            documents,
            EmbeddingOptions.builder().build(),
            batchingStrategy,
        )
        check(embeddings.size == documents.size) {
            "embedding count ${embeddings.size} does not match chunk count ${documents.size}"
        }
        val chunks = documents.mapIndexed { index, document ->
            val text = requireNotNull(document.text) { "token splitter returned a non-text document" }
            EmbeddedChunk(index, text, document.metadata, embeddings[index])
        }
        ragChunkStore.replace(userId, noteId, contentVersion, chunks)
    }

    fun search(
        userId: UUID,
        query: String,
        limit: Int,
        minSimilarity: Double,
    ): List<RetrievedChunk> = ragChunkStore.search(
        userId = userId,
        queryEmbedding = embeddingModel.embed(query),
        limit = limit,
        minSimilarity = minSimilarity,
    )

    /** Like [search], but never returns chunks of [excludeNoteId] — the note being updated. */
    fun searchExcluding(
        userId: UUID,
        query: String,
        limit: Int,
        minSimilarity: Double,
        excludeNoteId: UUID,
    ): List<RetrievedChunk> = ragChunkStore.search(
        userId = userId,
        queryEmbedding = embeddingModel.embed(query),
        limit = limit,
        minSimilarity = minSimilarity,
        excludeNoteId = excludeNoteId,
    )
}
