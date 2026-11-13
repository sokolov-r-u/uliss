package io.uliss.note_service.model

/**
 * What a Summarize request does: create the chat's main note, append to it, or write the messages after its boundary
 * into a new note branched from it.
 */
enum class SummaryMode {
    CREATE,
    UPDATE,
    BRANCH,
}
