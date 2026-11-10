package io.uliss.note_service.schema

/**
 * A table constraint: [type] is `pg_constraint.contype` (`p`, `u`, `f`, `c`, `x`), [definition] its SQL text,
 * [references] and [referencedColumns] the target of a foreign key, column for column with [columns].
 */
data class TableConstraint(
    val name: String,
    val type: Char,
    val definition: String,
    val columns: List<String>,
    val references: String? = null,
    val referencedColumns: List<String> = emptyList(),
)
