package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.projection.ChatTurnStatus

sealed interface AssistantStreamEvent {
    data class AppendText(val text: String) : AssistantStreamEvent
    data class GenerationPending(val retryAfterMs: Long) : AssistantStreamEvent
    data object GenerationCompleted : AssistantStreamEvent
    data class GenerationFailed(val status: ChatTurnStatus) : AssistantStreamEvent
}
