package io.uliss.note_service.util

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import org.junit.jupiter.api.Test
import java.util.UUID
import kotlin.test.assertEquals

class ChatSummaryChunksTest {

    private val chatId = UUID.randomUUID()

    @Test
    fun `the first chunk takes whole turns while they fit the limit`() {
        val first = turn("q".repeat(30), "a".repeat(30))
        val second = turn("q".repeat(30), "a".repeat(30))

        assertEquals(first.last().id, ChatSummaryChunks.firstChunkEnd(first + second, limitChars = 100))
    }

    @Test
    fun `everything that fits makes one chunk ending at the last message`() {
        val messages = turn("q".repeat(30), "a".repeat(20)) + turn("q".repeat(30), "a".repeat(20))

        assertEquals(messages.last().id, ChatSummaryChunks.firstChunkEnd(messages, limitChars = 100))
    }

    @Test
    fun `a single turn longer than the limit is still a chunk of its own`() {
        val long = turn("q".repeat(80), "a".repeat(80))
        val next = turn("q", "a")

        assertEquals(long.last().id, ChatSummaryChunks.firstChunkEnd(long + next, limitChars = 100))
    }

    @Test
    fun `a failed empty reply weighs nothing`() {
        val failed = turn("q".repeat(50), "")
        val next = turn("q".repeat(50), "")

        assertEquals(next.last().id, ChatSummaryChunks.firstChunkEnd(failed + next, limitChars = 100))
    }

    @Test
    fun `a historical question and its reply without a turn stay in one chunk`() {
        val historical = listOf(
            ChatMessageEntity(chatId, ChatMessageRole.USER, "q".repeat(50), ChatMessageStatus.COMPLETE),
            ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "a".repeat(50), ChatMessageStatus.COMPLETE),
        )

        assertEquals(historical.last().id, ChatSummaryChunks.firstChunkEnd(historical + turn("q", "a"), limitChars = 60))
    }

    private fun turn(question: String, answer: String): List<ChatMessageEntity> {
        val turnId = UUID.randomUUID()
        return listOf(
            ChatMessageEntity(chatId, ChatMessageRole.USER, question, ChatMessageStatus.COMPLETE, turnId),
            ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, answer, ChatMessageStatus.COMPLETE, turnId),
        )
    }
}
