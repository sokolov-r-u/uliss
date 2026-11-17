package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.ChatHistorySelection
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull

class ChatHistoryWindowTest {

    private val chatId = UUID.randomUUID()
    private val currentTurn = UUID.randomUUID()

    @Test
    fun `the last messages through the boundary overlap the tail after it`() {
        val history = (1..10).map { user("m$it") } + user("now", currentTurn)

        val selection = ChatHistoryWindow.selectAfterBoundary(history, history[7].id, currentTurn, 3, 1000)

        assertEquals(ChatHistorySelection(history.subList(5, 11), overlap = 3, skipped = 5), selection)
    }

    @Test
    fun `the overlap drops its oldest messages until it fits the character limit, even all of them`() {
        val history = listOf(user("a".repeat(40)), user("b".repeat(30)), user("c".repeat(50)), user("now", currentTurn))

        val fits = ChatHistoryWindow.selectAfterBoundary(history, history[2].id, currentTurn, 6, 80)
        val tooLong = ChatHistoryWindow.selectAfterBoundary(history, history[2].id, currentTurn, 6, 49)

        assertEquals(ChatHistorySelection(history.subList(1, 4), overlap = 2, skipped = 1), fits)
        assertEquals(ChatHistorySelection(history.subList(3, 4), overlap = 0, skipped = 3), tooLong)
    }

    @Test
    fun `empty replies count nowhere and the current turn's question is sent even on the boundary`() {
        val failed = ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, " ", ChatMessageStatus.FAILED)
        val question = user("x".repeat(100), currentTurn)
        val history = listOf(user("a"), failed, user("b"), question)

        val selection = ChatHistoryWindow.selectAfterBoundary(history, question.id, currentTurn, 1, 10)

        assertEquals(ChatHistorySelection(listOf(history[2], question), overlap = 1, skipped = 1), selection)
    }

    @Test
    fun `a boundary missing from the history selects nothing`() {
        val history = listOf(user("a"), user("now", currentTurn))

        assertNull(ChatHistoryWindow.selectAfterBoundary(history, UUID.randomUUID(), currentTurn, 6, 8000))
    }

    private fun user(content: String, turnId: UUID? = null) =
        ChatMessageEntity(chatId, ChatMessageRole.USER, content, ChatMessageStatus.COMPLETE, turnId)
}
