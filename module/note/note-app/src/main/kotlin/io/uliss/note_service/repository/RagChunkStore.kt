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

class EmbeddedChunk(
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
    val noteTitle: String?,
    val noteCreatedAt: Instant,
)

@Repository
class JdbcRagChunkStore(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {

    /**
     * Replaces the note's chunks with an index of its text at [contentVersion]. Index events of one note may run
     * concurrently and out of order: they are serialized per note, and an index older than the one stored is dropped.
     * Comparing with the stored index, not the note, keeps an index whose note changed since without new text
     * (a move, a status). Returns `false` when it was dropped.
     */
    @Transactional
    fun replace(userId: UUID, noteId: UUID, contentVersion: Long, chunks: List<EmbeddedChunk>): Boolean {
        jdbcTemplate.query(LOCK_NOTE_INDEX_SQL, { _ -> }, noteId.toString())
        val indexed = jdbcTemplate.queryForObject(INDEXED_VERSION_SQL, Long::class.java, noteId, userId)
        if (indexed != null && indexed > contentVersion) return false

        jdbcTemplate.update(DELETE_BY_NOTE_SQL, userId, noteId)
        if (chunks.isEmpty()) return true

        jdbcTemplate.batchUpdate(INSERT_SQL, object : BatchPreparedStatementSetter {
            override fun setValues(statement: PreparedStatement, index: Int) {
                val chunk = chunks[index]
                statement.setObject(1, userId)
                statement.setObject(2, noteId)
                statement.setInt(3, chunk.index)
                statement.setString(4, chunk.content)
                statement.setString(5, objectMapper.writeValueAsString(chunk.metadata))
                statement.setObject(6, PGvector(chunk.embedding))
                statement.setLong(7, contentVersion)
            }

            override fun getBatchSize(): Int = chunks.size
        })
        return true
    }

    @Transactional(readOnly = true)
    fun search(
        userId: UUID,
        queryEmbedding: FloatArray,
        limit: Int,
        minSimilarity: Double,
        excludeNoteId: UUID? = null,
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
                    noteTitle = resultSet.getString("note_title"),
                    noteCreatedAt = resultSet.getTimestamp("note_created_at").toInstant(),
                )
            },
            vector,
            userId,
            vector,
            1.0 - minSimilarity,
            excludeNoteId,
            vector,
            limit,
        )
    }

    private companion object {
        const val LOCK_NOTE_INDEX_SQL = "SELECT pg_advisory_xact_lock(hashtextextended('rag:' || ?, 0))"

        const val INDEXED_VERSION_SQL = "SELECT MAX(content_version) FROM note.rag_chunks WHERE note_id = ? AND user_id = ?"

        const val DELETE_BY_NOTE_SQL = """
            DELETE FROM note.rag_chunks
            WHERE user_id = ? AND note_id = ?
        """

        const val INSERT_SQL = """
            INSERT INTO note.rag_chunks
                (user_id, note_id, chunk_index, content, metadata, embedding, content_version, created_at)
            VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, CURRENT_TIMESTAMP)
        """

        const val SEARCH_SQL = """
            SELECT c.note_id,
                   c.chunk_index,
                   c.content,
                   1.0 - (c.embedding <=> ?) AS similarity,
                   n.title                   AS note_title,
                   n.created_at              AS note_created_at
            FROM note.rag_chunks c
                     JOIN note.notes n ON n.id = c.note_id AND n.user_id = c.user_id
            WHERE c.user_id = ?
              AND c.embedding <=> ? <= ?
              AND c.note_id IS DISTINCT FROM CAST(? AS uuid)
            ORDER BY c.embedding <=> ?
            LIMIT ?
        """
    }
}
