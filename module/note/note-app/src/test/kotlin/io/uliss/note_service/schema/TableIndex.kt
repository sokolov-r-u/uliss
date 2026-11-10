package io.uliss.note_service.schema

/** An index that backs no constraint; [definition] is the part of its DDL from the access method on. */
data class TableIndex(val name: String, val unique: Boolean, val definition: String)
