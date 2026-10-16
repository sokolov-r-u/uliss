package io.uliss.note_service.dto.internal

/** What the assistant is doing before its reply text starts; streamed as the SSE `activity` event. */
enum class AssistantActivity {
    THINKING,
    SEARCHING_NOTES,
}
