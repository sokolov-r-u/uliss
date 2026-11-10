package io.uliss.note_service.schema

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SchemaSnapshotMismatchTest {

    @Test
    fun `an equal file is no mismatch`() {
        assertNull(SchemaSnapshotMismatch.describe("schema\n", "schema\n"))
    }

    @Test
    fun `a changed file asks to regenerate it with the update task`() {
        assertEquals(
            "SCHEMA.md differs from the schema after all migrations. " +
                "If the migrations are right, regenerate it: ./gradlew :note:updateSchemaSnapshot",
            SchemaSnapshotMismatch.describe("old\n", "new\n"),
        )
    }

    @Test
    fun `a missing file asks to generate it with the update task`() {
        assertEquals(
            "SCHEMA.md is missing. Generate it: ./gradlew :note:updateSchemaSnapshot",
            SchemaSnapshotMismatch.describe(null, "new\n"),
        )
    }
}
