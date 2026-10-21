package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import net.jqwik.api.Arbitraries
import net.jqwik.api.Arbitrary
import net.jqwik.api.Combinators
import net.jqwik.api.ForAll
import net.jqwik.api.Property
import net.jqwik.api.Provide
import net.jqwik.api.constraints.IntRange
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class SummaryRetrievalQueryTest {

    @Test
    fun `retrieval query preserves unicode and multiline text when the chat fits`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Архитектура заметок 📝",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "Первая строка\nВторая строка"),
                message(chatId, ChatMessageRole.ASSISTANT, "Используем PostgreSQL и pgvector ✅"),
            ),
        )

        val query = SummaryRetrievalQuery.build(context, 500)

        assertEquals(
            "Chat title: Архитектура заметок 📝\n" +
                    "Transcript:\n" +
                    "USER: Первая строка\nВторая строка\n" +
                    "ASSISTANT: Используем PostgreSQL и pgvector ✅",
            query,
        )
    }

    @Test
    fun `retrieval query skips assistant replies without content, as the chat prompt to the provider does`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Plan",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "first"),
                ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "", ChatMessageStatus.FAILED),
                ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "", ChatMessageStatus.CANCELED),
                ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "  ", ChatMessageStatus.COMPLETE),
                message(chatId, ChatMessageRole.USER, "second"),
                ChatMessageEntity(chatId, ChatMessageRole.ASSISTANT, "half", ChatMessageStatus.PARTIAL),
            ),
        )

        val query = SummaryRetrievalQuery.build(context, 500)

        assertEquals("Chat title: Plan\nTranscript:\nUSER: first\nUSER: second\nASSISTANT: half", query)
    }

    @Test
    fun `retrieval query uses the complete transcript when its rendered length exactly matches the limit`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Boundary",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "question"),
                message(chatId, ChatMessageRole.ASSISTANT, "answer"),
            ),
        )
        val expected = "Chat title: Boundary\nTranscript:\nUSER: question\nASSISTANT: answer"

        val query = SummaryRetrievalQuery.build(context, expected.length)

        assertEquals(expected, query)
        assertTrue("[Earlier messages omitted]" !in query)
    }

    @Test
    fun `retrieval query keeps the beginning of an oversized initial message and the recent conversation`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "Large initial request",
            messages = listOf(
                message(
                    chatId,
                    ChatMessageRole.USER,
                    "INITIAL_MARKER " + "initial details ".repeat(30) + "DROPPED_INITIAL_END",
                ),
                message(chatId, ChatMessageRole.ASSISTANT, "middle ".repeat(30)),
                message(chatId, ChatMessageRole.USER, "RECENT_USER_DECISION"),
                message(chatId, ChatMessageRole.ASSISTANT, "FINAL_ASSISTANT_CONCLUSION"),
            ),
        )

        val query = SummaryRetrievalQuery.build(context, 320)

        assertEquals(320, query.length)
        assertTrue(query.contains("Initial user messages:\nUSER: INITIAL_MARKER"))
        assertTrue(query.substringBefore("\n\n[Earlier messages omitted]").endsWith("…"))
        assertTrue("DROPPED_INITIAL_END" !in query)
        assertTrue(query.contains("USER: RECENT_USER_DECISION"))
        assertTrue(query.endsWith("FINAL_ASSISTANT_CONCLUSION"))
    }

    @Test
    fun `retrieval query keeps the end of an oversized final message`() {
        val chatId = UUID.randomUUID()
        val finalContent = "DROPPED_FINAL_START " + "latest details ".repeat(40) + "FINAL_MARKER"
        val context = ChatSummaryContext(
            title = "Large final response",
            messages = listOf(
                message(chatId, ChatMessageRole.USER, "initial request"),
                message(chatId, ChatMessageRole.ASSISTANT, "middle ".repeat(30)),
                message(chatId, ChatMessageRole.ASSISTANT, finalContent),
            ),
        )

        val query = SummaryRetrievalQuery.build(context, 280)

        assertEquals(280, query.length)
        assertTrue(query.contains("Initial user messages:\nUSER: initial request"))
        assertTrue(query.contains("Recent conversation:\nASSISTANT: …"))
        assertTrue("DROPPED_FINAL_START" !in query)
        assertTrue(query.endsWith("FINAL_MARKER"))
    }

    @Test
    fun `retrieval query never exceeds a limit smaller than its structural prefixes`() {
        val chatId = UUID.randomUUID()
        val context = ChatSummaryContext(
            title = "A title that is longer than the available query budget",
            messages = listOf(message(chatId, ChatMessageRole.USER, "content")),
        )

        val query = SummaryRetrievalQuery.build(context, 24)

        assertEquals(24, query.length)
        assertEquals("Chat title: A title that", query)
    }

    @Property(tries = 300)
    fun `the query never exceeds its limit and is the whole transcript when that fits`(
        @ForAll("contexts") context: ChatSummaryContext,
        @ForAll @IntRange(min = 1, max = 600) maxChars: Int,
    ) {
        val query = SummaryRetrievalQuery.build(context, maxChars)
        val whole = SummaryRetrievalQuery.build(context, Int.MAX_VALUE)

        assertTrue(query.length <= maxChars, "length ${query.length} > $maxChars")
        if (whole.length <= maxChars) assertEquals(whole, query)
    }

    @Property(tries = 200)
    fun `a shortened query still ends with the end of the last message`(@ForAll("contexts") context: ChatSummaryContext) {
        // the last message the query renders: empty assistant replies are skipped, as in the chat prompt
        val last = context.messages.lastOrNull { it.role == ChatMessageRole.USER || it.content.isNotBlank() } ?: return
        // the first two user messages open a shortened query instead of closing it
        if (last in context.messages.filter { it.role == ChatMessageRole.USER }.take(2)) return
        val query = SummaryRetrievalQuery.build(context, 300)

        assertTrue(query.endsWith(last.content.takeLast(5)), "query: $query")
    }

    @Provide
    fun contexts(): Arbitrary<ChatSummaryContext> {
        val text = Arbitraries.strings().withCharRange('a', 'z').withChars(' ', '\n', 'ж', '✅').ofMinLength(1).ofMaxLength(120)
        val message = Combinators.combine(Arbitraries.of(ChatMessageRole.USER, ChatMessageRole.ASSISTANT), text)
            .`as` { role, content -> message(CHAT_ID, role, content) }
        return Combinators.combine(text, message.list().ofMinSize(1).ofMaxSize(12))
            .`as` { title, messages -> ChatSummaryContext(title, messages) }
    }

    private fun message(chatId: UUID, role: ChatMessageRole, content: String) =
        ChatMessageEntity(chatId, role, content, ChatMessageStatus.COMPLETE)

    private companion object {
        val CHAT_ID: UUID = UUID.randomUUID()
    }
}
