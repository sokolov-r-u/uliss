package io.uliss.note_service.schema

/** Checks that the section map and the real schema name the same tables and nothing else lives in the schema. */
object SchemaCoverage {
    private const val MAP = "NoteSchemaSections.SECTIONS"

    fun problems(sections: List<SchemaSection>, tables: Set<String>, strayObjects: List<String>): List<String> {
        val mapped = sections.flatMap { it.tables }
        val duplicated = mapped.groupingBy { it }.eachCount().filterValues { it > 1 }.keys.sorted()
        return duplicated.map { "Table $it is listed in more than one section of $MAP" } +
            (tables - mapped.toSet()).sorted().map { "Table $it has no section: add it to a section of $MAP" } +
            (mapped.toSet() - tables).sorted().map { "Table $it is in $MAP but not in the schema: remove it" } +
            strayObjects.sorted().map { "Object $it is not covered by the snapshot: teach NoteSchemaReader and SchemaSnapshotRenderer to show it" }
    }
}
