package io.uliss.note_service

import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceUtils
import org.springframework.jdbc.datasource.init.ScriptUtils
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.assertEquals

/** Runs the V27 script again over the schema it starts from: posters as `note.notes.poster_url`. */
class NotePosterMigrationIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var dataSource: DataSource

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    lateinit var noteRepository: NoteRepository

    private val userId = UUID.randomUUID()

    @Test
    fun `moves every poster link into note_posters without a crop and drops the column`() {
        val withPoster = noteRepository.save(NoteEntity(userId, "body", title = "With"))
        val without = noteRepository.save(NoteEntity(userId, "body", title = "Without"))

        // DDL is transactional in Postgres: rebuild the V26 shape, migrate, check, then roll back
        transactionTemplate.executeWithoutResult { transaction ->
            jdbcTemplate.execute("DROP TABLE note.note_posters")
            jdbcTemplate.execute("ALTER TABLE note.notes ADD COLUMN poster_url VARCHAR(2048)")
            jdbcTemplate.update(
                "UPDATE note.notes SET poster_url = ? WHERE id = ?", "https://example.com/p.jpg", withPoster.id,
            )

            ScriptUtils.executeSqlScript(
                DataSourceUtils.getConnection(dataSource),
                ClassPathResource("db/migration/V27__ddl_create_note_posters.sql"),
            )

            val rows = jdbcTemplate.queryForList(
                "SELECT note_id, url, crop FROM note.note_posters WHERE note_id IN (?, ?)", withPoster.id, without.id,
            )
            assertEquals(listOf(mapOf("note_id" to withPoster.id, "url" to "https://example.com/p.jpg", "crop" to null)), rows)
            assertEquals(0, jdbcTemplate.queryForObject(
                "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'note' AND table_name = 'notes' AND column_name = 'poster_url'",
                Int::class.java,
            ))
            transaction.setRollbackOnly()
        }
    }
}
