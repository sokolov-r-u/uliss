package io.uliss.note_service.schema

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class SchemaCoverageTest {

    private val sections = listOf(
        SchemaSection("Notes", "", listOf("notes", "note_posters")),
        SchemaSection("Chats", "", listOf("chat")),
    )

    @Test
    fun `a schema that matches the map has no problems`() {
        assertEquals(emptyList(), SchemaCoverage.problems(sections, setOf("notes", "note_posters", "chat"), emptyList()))
    }

    @Test
    fun `names a new table without a section, a mapped table that is gone, and a stray object`() {
        val problems = SchemaCoverage.problems(
            sections,
            tables = setOf("notes", "chat", "graph_edges"),
            strayObjects = listOf("view recent_notes"),
        )

        assertEquals(
            listOf(
                "Table graph_edges has no section: add it to a section of NoteSchemaSections.SECTIONS",
                "Table note_posters is in NoteSchemaSections.SECTIONS but not in the schema: remove it",
                "Object view recent_notes is not covered by the snapshot: " +
                    "teach NoteSchemaReader and SchemaSnapshotRenderer to show it",
            ),
            problems,
        )
    }

    @Test
    fun `a table listed in two sections is a problem`() {
        val twice = sections + SchemaSection("Posters", "", listOf("note_posters"))

        assertEquals(
            listOf("Table note_posters is listed in more than one section of NoteSchemaSections.SECTIONS"),
            SchemaCoverage.problems(twice, setOf("notes", "note_posters", "chat"), emptyList()),
        )
    }
}
