package io.uliss.note_service.util

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import java.util.UUID

/** Splits the messages a Summarize reads into chunks one model call can take. */
object ChatSummaryChunks {

    /**
     * The last message of the first chunk of [messages] (ordered): whole turns while their characters fit
     * [limitChars], and at least the first turn even when it alone is longer. A question is never cut from its reply.
     */
    fun firstChunkEnd(messages: List<ChatMessageEntity>, limitChars: Int): UUID {
        val turns = turnsOf(messages)
        var chars = 0L
        var end = turns.first()
        for (turn in turns) {
            chars += turn.sumOf { it.content.codePointCount(0, it.content.length).toLong() }
            if (chars > limitChars && turn !== turns.first()) break
            end = turn
        }
        return end.last().id
    }

    /**
     * Consecutive messages of one turn. Historical messages have no turn: a question without one is paired with the
     * reply right after it, and any other such message stands alone.
     */
    private fun turnsOf(messages: List<ChatMessageEntity>): List<List<ChatMessageEntity>> {
        val turns = mutableListOf<MutableList<ChatMessageEntity>>()
        for (message in messages) {
            val last = turns.lastOrNull()
            if (last != null && sameTurn(last, message)) last += message
            else turns += mutableListOf(message)
        }
        return turns
    }

    private fun sameTurn(turn: List<ChatMessageEntity>, message: ChatMessageEntity): Boolean {
        val previous = turn.last()
        if (message.turnId != null) return previous.turnId == message.turnId
        return previous.turnId == null && turn.size == 1 &&
            previous.role == ChatMessageRole.USER && message.role == ChatMessageRole.ASSISTANT
    }
}
