package io.uliss.note_service.repository

import io.uliss.note_service.dto.internal.ListCursor
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.util.UUID

/**
 * Reads the note list in `updated_at DESC, id DESC` order as keyset positions; the caller loads the notes. The
 * conditions are assembled per call, so a list filter becomes one more condition here.
 */
@Repository
class NoteListStore(private val jdbcTemplate: NamedParameterJdbcTemplate) {

    /** Up to [limit] positions of the user's unpinned notes strictly after [after] (from the newest when null). */
    fun findPage(userId: UUID, after: ListCursor?, limit: Int): List<ListCursor> {
        val params = MapSqlParameterSource("userId", userId).addValue("limit", limit)
        // pinned notes come in their own list (`NoteRepository.findPinned`)
        val conditions = mutableListOf("user_id = :userId", "pinned_at IS NULL")
        if (after != null) {
            conditions += "(updated_at, id) < (:afterAt, :afterId)"
            params.addValue("afterAt", Timestamp.from(after.updatedAt)).addValue("afterId", after.id)
        }
        val sql = """
            SELECT id, updated_at
            FROM note.notes
            WHERE ${conditions.joinToString(" AND ")}
            ORDER BY updated_at DESC, id DESC
            LIMIT :limit
        """
        return jdbcTemplate.query(sql, params) { rs, _ ->
            ListCursor(rs.getTimestamp("updated_at").toInstant(), rs.getObject("id", UUID::class.java))
        }
    }

    fun count(userId: UUID): Int =
        jdbcTemplate.queryForObject(COUNT_SQL, MapSqlParameterSource("userId", userId), Int::class.java) ?: 0

    private companion object {
        const val COUNT_SQL = "SELECT count(*) FROM note.notes WHERE user_id = :userId"
    }
}
