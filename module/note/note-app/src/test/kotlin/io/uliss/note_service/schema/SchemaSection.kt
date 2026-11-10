package io.uliss.note_service.schema

/** One area of `SCHEMA.md`: its heading, a one-line summary and its tables in display order. */
data class SchemaSection(val title: String, val description: String, val tables: List<String>)
