package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.ChatHistorySelection
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import java.util.UUID

/** Which messages of a summarized chat a turn sends after the chat's notes. */
object ChatHistoryWindow {

    /**
     * Every message after [boundaryMessageId], preceded by an overlap: up to [overlapMessages] last messages through
     * the boundary, the oldest dropped until they fit [overlapMaxChars]. Empty replies count nowhere. The question of
     * [currentTurnId] is always sent, outside the overlap and its limits, even when the boundary is on or after it.
     * Null when the boundary is not among [history].
     */
    fun selectAfterBoundary(
        history: List<ChatMessageEntity>,
        boundaryMessageId: UUID,
        currentTurnId: UUID,
        overlapMessages: Int,
        overlapMaxChars: Int,
    ): ChatHistorySelection? {
        val boundaryIndex = history.indexOfFirst { it.id == boundaryMessageId }
        if (boundaryIndex < 0) return null
        val (before, after) = history.withIndex()
            .filterNot { it.value.isEmptyAssistantReply() }
            .partition { it.index <= boundaryIndex && !it.value.isQuestionOf(currentTurnId) }
        var overlap = before.map { it.value }.takeLast(overlapMessages)
        while (overlap.sumOf { it.content.length } > overlapMaxChars) overlap = overlap.drop(1)
        return ChatHistorySelection(overlap + after.map { it.value }, overlap.size, before.size - overlap.size)
    }

    private fun ChatMessageEntity.isQuestionOf(turnId: UUID): Boolean = role == ChatMessageRole.USER && this.turnId == turnId
}
