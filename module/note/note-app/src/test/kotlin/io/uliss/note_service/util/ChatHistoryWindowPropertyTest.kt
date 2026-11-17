package io.uliss.note_service.util

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.constraints.IntRange
import net.jqwik.api.constraints.Size
import net.jqwik.api.constraints.StringLength
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ChatHistoryWindowPropertyTest {

    private val chatId = UUID.randomUUID()
    private val currentTurn = UUID.randomUUID()

    @Property(tries = 500)
    fun `the selection keeps the order, the whole tail and the question, and an overlap within its limits`(
        @ForAll @Size(min = 1, max = 30) contents: List<@StringLength(max = 40) String>,
        @ForAll @IntRange(min = 0, max = 29) boundaryPick: Int,
        @ForAll @IntRange(min = 0, max = 8) overlapMessages: Int,
        @ForAll @IntRange(min = 0, max = 120) overlapMaxChars: Int,
    ) {
        // the last message is the current turn's question; blank odd messages are failed replies
        val history = contents.mapIndexed { i, content ->
            when {
                i == contents.lastIndex -> message(ChatMessageRole.USER, content.ifBlank { "q" }, currentTurn)
                i % 2 == 1 -> message(ChatMessageRole.ASSISTANT, content)
                else -> message(ChatMessageRole.USER, content)
            }
        }
        val boundaryIndex = boundaryPick % history.size

        val selection = assertNotNull(
            ChatHistoryWindow.selectAfterBoundary(
                history, history[boundaryIndex].id, currentTurn, overlapMessages, overlapMaxChars,
            ),
        )

        val sent = history.filterNot { it.isEmptyAssistantReply() }
        assertEquals(sent.filter { it in selection.messages }, selection.messages, "a chronological subsequence")
        val overlap = selection.messages.take(selection.overlap)
        assertTrue(overlap.size <= overlapMessages && overlap.sumOf { it.content.length } <= overlapMaxChars)
        val tail = sent.filterIndexed { _, m -> history.indexOf(m) > boundaryIndex || m.turnId == currentTurn }
        assertEquals(tail, selection.messages.drop(selection.overlap), "the whole tail and the question")
        assertEquals(sent.size, selection.messages.size + selection.skipped, "every message is sent or skipped")
    }

    private fun message(role: ChatMessageRole, content: String, turnId: UUID? = null) =
        ChatMessageEntity(chatId, role, content, ChatMessageStatus.COMPLETE, turnId)
}
