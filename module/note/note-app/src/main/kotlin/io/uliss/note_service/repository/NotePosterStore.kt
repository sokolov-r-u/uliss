package io.uliss.note_service.repository

import io.uliss.note_service.model.payload.PosterCrop
import io.uliss.note_service.model.projection.NotePoster
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate
import org.springframework.stereotype.Repository
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
        ) { rs, _ ->
            NotePoster(rs.getString("url"), rs.getString("crop")?.let { objectMapper.readValue(it, PosterCrop::class.java) })
        }.firstOrNull()

    private companion object {
        val SAVE_SQL = """
            INSERT INTO note.note_posters (note_id, url, crop)
            SELECT id, :url, CAST(:crop AS jsonb)
            FROM note.notes
            WHERE id = :noteId AND user_id = :userId
            ON CONFLICT (note_id) DO UPDATE SET url = EXCLUDED.url, crop = EXCLUDED.crop
        """.trimIndent()
    }
}
