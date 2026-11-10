package io.uliss.note_service.schema

/** Explains why the committed `SCHEMA.md` text differs from the migrated schema, or null when it does not. */
object SchemaSnapshotMismatch {
    fun describe(committed: String?, actual: String): String? = when (committed) {
        actual -> null
        null -> "SCHEMA.md is missing. Generate it: ${SchemaSnapshotRenderer.UPDATE_COMMAND}"
        else -> "SCHEMA.md differs from the schema after all migrations. " +
            "If the migrations are right, regenerate it: ${SchemaSnapshotRenderer.UPDATE_COMMAND}"
    }
}
