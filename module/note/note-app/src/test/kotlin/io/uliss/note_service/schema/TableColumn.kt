package io.uliss.note_service.schema

/** A table column as the catalog describes it; [default] also carries identity and generated expressions. */
data class TableColumn(
    val name: String,
    val type: String,
    val nullable: Boolean,
    val default: String?,
    val comment: String?,
)
