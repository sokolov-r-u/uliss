package io.uliss.note_service.dto.internal

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.projection.ChatTurn

sealed interface ChatTurnRequestResolution {
    /** [history] is what the model gets as messages; [cut] is set when the chat's notes replace its start. */
    data class StartGeneration(
        val turn: ChatTurn,
        val history: List<ChatMessageEntity>,
        val cut: ChatHistoryCut? = null,
    ) : ChatTurnRequestResolution

    data class AlreadyGenerating(val turn: ChatTurn) : ChatTurnRequestResolution

    data class AlreadyFinished(val turn: ChatTurn) : ChatTurnRequestResolution
}
