package io.uliss.note_service.repository

import com.pgvector.PGvector
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.PreparedStatement
import java.time.Instant
import java.util.UUID

data class EmbeddedChunk(
    val index: Int,
    val content: String,
    val metadata: Map<String, Any>,
    val embedding: FloatArray,
)

data class RetrievedChunk(
    val noteId: UUID,
    val chunkIndex: Int,
    val content: String,
    val similarity: Double,
)

@Repository
class JdbcRagChunkStore(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {

    @Transactional
    fun replace(userId: UUID, noteId: UUID, chunks: List<EmbeddedChunk>) {
        jdbcTemplate.update(DELETE_BY_NOTE_SQL, userId, noteId)
        if (chunks.isEmpty()) return

        val createdAt = Instant.now()
        jdbcTemplate.batchUpdate(INSERT_SQL, object : BatchPreparedStatementSetter {
            override fun setValues(statement: PreparedStatement, index: Int) {
                val chunk = chunks[index]
                statement.setObject(1, userId)
                statement.setObject(2, noteId)
                statement.setInt(3, chunk.index)
                statement.setString(4, chunk.content)
                statement.setString(5, objectMapper.writeValueAsString(chunk.metadata))
                statement.setObject(6, PGvector(chunk.embedding))
                statement.setObject(7, createdAt)
            }

            override fun getBatchSize(): Int = chunks.size
        })
    }

    @Transactional(readOnly = true)
    fun search(
        userId: UUID,
        queryEmbedding: FloatArray,
        limit: Int,
        minSimilarity: Double,
    ): List<RetrievedChunk> {
        require(limit > 0) { "limit must be positive" }
        require(minSimilarity in 0.0..1.0) { "minSimilarity must be between 0 and 1" }

        val vector = PGvector(queryEmbedding)
        return jdbcTemplate.query(
            SEARCH_SQL,
            { resultSet, _ ->
                RetrievedChunk(
                    noteId = resultSet.getObject("note_id", UUID::class.java),
                    chunkIndex = resultSet.getInt("chunk_index"),
                    content = resultSet.getString("content"),
                    similarity = resultSet.getDouble("similarity"),
                )
            },
            vector,
            userId,
            vector,
            1.0 - minSimilarity,
            vector,
            limit,
        )
    }

    private companion object {
        const val DELETE_BY_NOTE_SQL = """
            DELETE FROM note.rag_chunks
            WHERE user_id = ? AND note_id = ?
        """

        const val INSERT_SQL = """
            INSERT INTO note.rag_chunks
                (user_id, note_id, chunk_index, content, metadata, embedding, created_at)
            VALUES (?, ?, ?, ?, ?::jsonb, ?, ?)
        """

        const val SEARCH_SQL = """
            SELECT note_id,
                   chunk_index,
                   content,
                   1.0 - (embedding <=> ?) AS similarity
            FROM note.rag_chunks
            WHERE user_id = ?
              AND embedding <=> ? <= ?
            ORDER BY embedding <=> ?
            LIMIT ?
        """
    }
}
