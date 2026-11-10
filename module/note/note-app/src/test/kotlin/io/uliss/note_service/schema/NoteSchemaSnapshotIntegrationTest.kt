package io.uliss.note_service.schema

import io.uliss.note_service.NoteIntegrationTest
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.postgresql.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * Keeps `SCHEMA.md` equal to the `note` schema that Flyway builds. With `note.schema.update=true` (the
 * `updateSchemaSnapshot` task) it rewrites the file instead of comparing.
 */
class NoteSchemaSnapshotIntegrationTest : NoteIntegrationTest() {

    @Autowired
    lateinit var postgres: PostgreSQLContainer

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var transactionTemplate: TransactionTemplate

    private val reader by lazy { NoteSchemaReader(postgres, jdbcTemplate) }

    @Test
    fun `SCHEMA md matches the schema after all migrations`() {
        val sections = NoteSchemaSections.SECTIONS
        val problems = SchemaCoverage.problems(sections, reader.tables(), reader.strayObjects())
        if (problems.isNotEmpty()) fail(problems.joinToString("\n"))

        val actual = SchemaSnapshotRenderer.render(
            reader.extensions(),
            sections,
            sections.flatMap { it.tables }.associateWith(reader::tableDdl),
        )
        val file = snapshotFile()
        if (System.getProperty(UPDATE_PROPERTY).toBoolean()) {
            Files.writeString(file, actual)
            return
        }
        val committed = if (Files.exists(file)) Files.readString(file) else null
        SchemaSnapshotMismatch.describe(committed, actual)?.let { message ->
            if (committed == null) fail(message) else assertEquals(committed, actual, message)
        }
    }

    @Test
    fun `an object outside any table is reported as stray`() {
        transactionTemplate.executeWithoutResult { transaction ->
            jdbcTemplate.execute("CREATE VIEW note.snapshot_probe AS SELECT 1 AS one")
            jdbcTemplate.execute("CREATE FUNCTION note.snapshot_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'")

            val stray = reader.strayObjects()

            assertTrue("view snapshot_probe" in stray, "stray objects: $stray")
            assertTrue("function snapshot_probe_fn" in stray, "stray objects: $stray")
            transaction.setRollbackOnly()
        }
    }

    private fun snapshotFile(): Path = Path.of(
        requireNotNull(System.getProperty(FILE_PROPERTY)) { "System property $FILE_PROPERTY is not set by Gradle" },
    )

    private companion object {
        const val FILE_PROPERTY = "note.schema.file"
        const val UPDATE_PROPERTY = "note.schema.update"
    }
}
