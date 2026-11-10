package io.uliss.note_service.repository

import io.uliss.note_service.model.payload.PosterCrop
import io.uliss.note_service.model.projection.NotePoster
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import tools.jackson.databind.ObjectMapper
import java.util.UUID

/**
 * Note posters (`note.note_posters`). They live apart from `note.notes`, so writing one never touches a note's
 * `version` or `updated_at`; deleting a note deletes its poster (`ON DELETE CASCADE`).
 */
@Repository
class NotePosterStore(
    private val jdbcTemplate: NamedParameterJdbcTemplate,
    private val objectMapper: ObjectMapper,
) {

    /** Sets the owned note's poster, replacing link and crop; false when the note is not the user's. */
    fun save(userId: UUID, noteId: UUID, url: String, crop: PosterCrop?): Boolean {
        val params = MapSqlParameterSource()
            .addValue("noteId", noteId)
            .addValue("userId", userId)
            .addValue("url", url)
            .addValue("crop", crop?.let(objectMapper::writeValueAsString))
        return jdbcTemplate.update(SAVE_SQL, params) > 0
    }

    /** Removes the note's poster, if any; callers check ownership. */
    fun delete(noteId: UUID) {
        jdbcTemplate.update("DELETE FROM note.note_posters WHERE note_id = :noteId", mapOf("noteId" to noteId))
    }

    /** The note's poster; null when it has none. Callers pass an owned note id. */
    fun find(noteId: UUID): NotePoster? =
        jdbcTemplate.query(
            "SELECT url, crop FROM note.note_posters WHERE note_id = :noteId",
            mapOf("noteId" to noteId),
        ) { rs, _ -> poster(rs) }.firstOrNull()

    /** Every poster of the user's notes, keyed by note id, for the sky. */
    fun findByUser(userId: UUID): Map<UUID, NotePoster> =
        jdbcTemplate.query(FIND_BY_USER_SQL, mapOf("userId" to userId)) { rs, _ ->
            rs.getObject("note_id", UUID::class.java) to poster(rs)
        }.toMap()

    private fun poster(rs: ResultSet) =
        NotePoster(rs.getString("url"), rs.getString("crop")?.let { objectMapper.readValue(it, PosterCrop::class.java) })

    private companion object {
        val SAVE_SQL = """
            INSERT INTO note.note_posters (note_id, url, crop)
            SELECT id, :url, CAST(:crop AS jsonb)
            FROM note.notes
            WHERE id = :noteId AND user_id = :userId
            ON CONFLICT (note_id) DO UPDATE SET url = EXCLUDED.url, crop = EXCLUDED.crop
        """.trimIndent()

        val FIND_BY_USER_SQL = """
            SELECT p.note_id, p.url, p.crop
            FROM note.note_posters p
            JOIN note.notes n ON n.id = p.note_id
            WHERE n.user_id = :userId
        """.trimIndent()
    }
}
