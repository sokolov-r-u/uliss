package io.uliss.note_service.util

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.constraints.IntRange
import net.jqwik.api.constraints.Size
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ChatSummaryChunksPropertyTest {

    private val chatId = UUID.randomUUID()

    @Property(tries = 500)
    fun `repeated first chunks cover the messages in order, keep turns whole and fit the limit unless one turn is longer`(
        @ForAll @Size(min = 1, max = 25) turnSizes: List<Int>,
        @ForAll @IntRange(min = 1, max = 150) limitChars: Int,
    ) {
        val messages = turnSizes.flatMap { raw ->
            val size = raw.mod(61)
            val turnId = UUID.randomUUID()
            listOf(
                ChatMessageEntity(chatId, ChatMessageRole.USER, "q".repeat(size / 2), ChatMessageStatus.COMPLETE, turnId),
                ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "a".repeat(size - size / 2), ChatMessageStatus.COMPLETE, turnId),
            )
        }

        val chunks = mutableListOf<List<ChatMessageEntity>>()
        var rest = messages
        while (rest.isNotEmpty()) {
            val end = ChatSummaryChunks.firstChunkEnd(rest, limitChars)
            val endIndex = rest.indexOfFirst { it.id == end }
            chunks += rest.take(endIndex + 1)
            rest = rest.drop(endIndex + 1)
        }

        assertEquals(messages.map { it.id }, chunks.flatten().map { it.id })
        chunks.forEach { chunk ->
            assertEquals(ChatMessageRole.ASSISTANT, chunk.last().role, "a chunk ends with a whole turn")
            val chars = chunk.sumOf { it.content.length }
            assertTrue(chars <= limitChars || chunk.size == 2, "a chunk over the limit is one turn: $chars > $limitChars")
        }
    }
}
