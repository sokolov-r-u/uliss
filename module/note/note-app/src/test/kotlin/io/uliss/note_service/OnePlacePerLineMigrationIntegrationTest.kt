package io.uliss.note_service

import io.uliss.note_service.model.ConstellationEntity
import io.uliss.note_service.model.ConstellationLightness
import io.uliss.note_service.model.NoteEntity
import io.uliss.note_service.repository.ConstellationRepository
import io.uliss.note_service.repository.NoteConstellationStore
import io.uliss.note_service.repository.NoteRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.core.io.ClassPathResource
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceUtils
import org.springframework.jdbc.datasource.init.ScriptUtils
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.assertEquals

/** Runs the V12 script again over memberships that break the one-place-per-line rule. */
class OnePlacePerLineMigrationIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var dataSource: DataSource

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    @Autowired
    lateinit var constellationRepository: ConstellationRepository

    @Autowired
    lateinit var noteRepository: NoteRepository

    @Autowired
    lateinit var store: NoteConstellationStore


    private val userId = UUID.randomUUID()
    private val t0: Instant = Instant.parse("2026-10-19T10:00:00Z")

    @Test
    fun `drops ancestors on a line and hands their main to the oldest remaining descendant`() {
        val music = root("Music")
        val jazz = child(music.id, "Jazz")
        val miles = child(jazz.id, "Miles")
        val bebop = child(jazz.id, "Bebop")
        val rock = child(music.id, "Rock")
        val films = root("Films")
        val mainAbove = note()
        val secondaryAbove = note()
        val clean = note()
        insert(mainAbove, music.id, main = true, minute = 0)
        insert(mainAbove, bebop.id, main = false, minute = 5)
        insert(mainAbove, miles.id, main = false, minute = 3)
        insert(mainAbove, films.id, main = false, minute = 1)
        insert(secondaryAbove, films.id, main = true, minute = 0)
        insert(secondaryAbove, jazz.id, main = false, minute = 1)
        insert(secondaryAbove, miles.id, main = false, minute = 2)
        insert(clean, jazz.id, main = true, minute = 0)
        insert(clean, rock.id, main = false, minute = 1)

        // the script touches every user's rows in the shared database: check inside its transaction, then roll back
        transactionTemplate.executeWithoutResult { transaction ->
            ScriptUtils.executeSqlScript(
                DataSourceUtils.getConnection(dataSource),
                ClassPathResource("db/migration/V12__dml_one_place_per_line.sql"),
            )

            assertEquals(
                listOf(miles.id to true, films.id to false, bebop.id to false),
                store.findByNote(userId, mainAbove).map { it.constellationId to it.main },
            )
            assertEquals(
                listOf(films.id to true, miles.id to false),
                store.findByNote(userId, secondaryAbove).map { it.constellationId to it.main },
            )
            assertEquals(
                listOf(jazz.id to true, rock.id to false),
                store.findByNote(userId, clean).map { it.constellationId to it.main },
            )
            transaction.setRollbackOnly()
        }
    }

    private fun insert(noteId: UUID, constellationId: UUID, main: Boolean, minute: Long) {
        jdbcTemplate.update(
            """
                INSERT INTO note.note_constellation (note_id, constellation_id, user_id, is_main, added_at)
                VALUES (?, ?, ?, ?, ?)
            """.trimIndent(),
            noteId, constellationId, userId, main, Timestamp.from(t0.plusSeconds(minute * 60)),
        )
    }

    private fun note(): UUID = noteRepository.saveAndFlush(NoteEntity(userId, "body")).id

    private fun root(name: String): ConstellationEntity =
        constellationRepository.saveAndFlush(ConstellationEntity(userId, null, name, 264, null))

    private fun child(parentId: UUID, name: String): ConstellationEntity =
        constellationRepository.saveAndFlush(ConstellationEntity(userId, parentId, name, null, ConstellationLightness.LIGHT))
}
