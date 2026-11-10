package io.uliss.note_service.schema

/** An installed Postgres extension, as `pg_extension` reports it. */
data class SchemaExtension(val name: String, val schema: String, val version: String)
