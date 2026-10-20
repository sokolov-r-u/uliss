package io.uliss.note_service.model.projection

enum class ChatTurnStatus {
    GENERATING,
    COMPLETE,
    PARTIAL,
    FAILED,
    CANCELED,
}
