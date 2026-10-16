package io.uliss.note_service.outbox

enum class OutboxEventType {
    NOTE_SUMMARY_REQUESTED,
    NOTE_SUMMARY_UPDATE_REQUESTED,
    NOTE_INDEX_REQUESTED,
}
