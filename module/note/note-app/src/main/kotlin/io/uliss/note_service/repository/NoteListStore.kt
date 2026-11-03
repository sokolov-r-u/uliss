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

    /**
     * Up to [limit] positions of the user's notes strictly after [after] (from the newest when null). A non-empty
     * [constellationIds] keeps the notes of those constellations and their subtrees with all their sub-notes; ids that
     * are not the user's add nothing.
     */
    fun findPage(
        userId: UUID,
        after: ListCursor?,
        limit: Int,
        constellationIds: Set<UUID> = emptySet(),
    ): List<ListCursor> {
        val query = Query(userId, constellationIds)
        if (after != null) {
            query.conditions += "(updated_at, id) < (:afterAt, :afterId)"
            query.params.addValue("afterAt", Timestamp.from(after.updatedAt)).addValue("afterId", after.id)
        }
        val sql = """
            ${query.with}
            SELECT id, updated_at
            FROM note.notes
            WHERE ${query.where()}
            ORDER BY updated_at DESC, id DESC
            LIMIT :limit
        """
        return jdbcTemplate.query(sql, query.params.addValue("limit", limit)) { rs, _ ->
            ListCursor(rs.getTimestamp("updated_at").toInstant(), rs.getObject("id", UUID::class.java))
        }
    }

    /** The size of the list [findPage] reads with the same filter. */
    fun count(userId: UUID, constellationIds: Set<UUID> = emptySet()): Int {
        val query = Query(userId, constellationIds)
        val sql = "${query.with} SELECT count(*) FROM note.notes WHERE ${query.where()}"
        return jdbcTemplate.queryForObject(sql, query.params, Int::class.java) ?: 0
    }

    /** The owner and filter part of a list query, shared by the page and its count. */
    private class Query(userId: UUID, constellationIds: Set<UUID>) {
        val params = MapSqlParameterSource("userId", userId)
        val conditions = mutableListOf("user_id = :userId")
        val with = if (constellationIds.isEmpty()) "" else IN_CONSTELLATIONS_CTE

        init {
            if (constellationIds.isNotEmpty()) {
                conditions += "id IN (SELECT note_id FROM filtered_notes)"
                params.addValue("constellationIds", constellationIds)
            }
        }

        fun where() = conditions.joinToString(" AND ")
    }

    private companion object {

        // The user's given constellations with their whole subtrees, the notes placed in any of them, and every
        // sub-note of those notes (a sub-note lives where its top note lives). UNION stops even on cyclic data.
        const val IN_CONSTELLATIONS_CTE = """
            WITH RECURSIVE subtree AS (
                SELECT id
                FROM note.constellations
                WHERE user_id = :userId AND id IN (:constellationIds)
                UNION
                SELECT c.id
                FROM subtree s
                         JOIN note.constellations c ON c.parent_id = s.id
                WHERE c.user_id = :userId
            ),
            filtered_notes AS (
                SELECT note_id
                FROM note.note_constellation
                WHERE user_id = :userId AND constellation_id IN (SELECT id FROM subtree)
                UNION
                SELECT n.id
                FROM filtered_notes f
                         JOIN note.notes n ON n.parent_note_id = f.note_id
                WHERE n.user_id = :userId
            )
        """
    }
}
