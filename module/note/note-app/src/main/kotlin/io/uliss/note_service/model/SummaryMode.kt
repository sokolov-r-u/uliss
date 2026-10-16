package io.uliss.note_service.model

/** What a Summarize request does: create the chat's first note or append to its current note. */
enum class SummaryMode {
    CREATE,
    UPDATE,
}
