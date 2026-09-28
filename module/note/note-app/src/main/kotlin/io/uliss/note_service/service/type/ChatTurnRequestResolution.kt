package io.uliss.note_service.service.type

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatTurn

sealed interface ChatTurnRequestResolution {
    data class StartGeneration(
        val turn: ChatTurn,
        val history: List<ChatMessageEntity>,
    ) : ChatTurnRequestResolution

    data class AlreadyGenerating(val turn: ChatTurn) : ChatTurnRequestResolution

    data class AlreadyFinished(val turn: ChatTurn) : ChatTurnRequestResolution
}
