package io.uliss.note_service.schema

/** Everything `SCHEMA.md` shows about one table, columns in their physical order. */
data class TableSchema(
    val name: String,
    val comment: String?,
    val columns: List<TableColumn>,
    val constraints: List<TableConstraint>,
    val indexes: List<TableIndex>,
)
