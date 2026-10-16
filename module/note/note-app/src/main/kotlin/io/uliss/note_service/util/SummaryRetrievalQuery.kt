package io.uliss.note_service.util

import io.uliss.note_service.dto.internal.ChatSummaryContext
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import java.util.UUID

/** Bounded embedding query for a chat transcript: the whole transcript when it fits, else its start and end. */
object SummaryRetrievalQuery {

    private const val INITIAL_MESSAGES_BUDGET_RATIO = 0.30
    private const val RETRIEVAL_MESSAGE_SEPARATOR = ": "
    private const val TRUNCATION_MARKER = "…"

    fun build(context: ChatSummaryContext, maxChars: Int): String {
        val messages = context.messages.filterNot { it.isEmptyAssistantReply() }
        val fullPrefix = "Chat title: ${context.title}\nTranscript:\n"
        val fullLength = fullPrefix.length.toLong() + retrievalTranscriptLength(messages)
        if (fullLength <= maxChars.toLong()) {
            return fullPrefix + renderRetrievalTranscript(messages)
        }

        val shortenedPrefix = "Chat title: ${context.title}\n\nInitial user messages:\n"
        val recentPrefix = "\n\n[Earlier messages omitted]\n\nRecent conversation:\n"
        val contentBudget = maxChars - shortenedPrefix.length - recentPrefix.length
        if (contentBudget <= 0) {
            return compactRecentQuery(context.title, messages, maxChars)
        }

        val initial = fitMessagesFromStart(
            messages.filter { it.role == ChatMessageRole.USER }.take(2),
            (contentBudget * INITIAL_MESSAGES_BUDGET_RATIO).toInt(),
        )
        val recentMessages = messages.filterNot { message ->
            message.id in initial.messageIds
        }
        val recent = fitMessagesFromEnd(recentMessages, contentBudget - initial.text.length)
        return (shortenedPrefix + initial.text + recentPrefix + recent).take(maxChars)
    }

    private fun compactRecentQuery(title: String, messages: List<ChatMessageEntity>, maxChars: Int): String {
        val prefix = "Chat title: $title\nRecent conversation:\n"
        val recent = fitMessagesFromEnd(messages, (maxChars - prefix.length).coerceAtLeast(0))
        return (prefix.take(maxChars) + recent).take(maxChars)
    }

    private fun fitMessagesFromStart(messages: List<ChatMessageEntity>, maxChars: Int): FittedMessages {
        if (maxChars <= 0) return FittedMessages("", emptySet())
        val result = StringBuilder()
        val messageIds = mutableSetOf<UUID>()
        for (message in messages) {
            val separatorLength = if (result.isEmpty()) 0 else 1
            val remaining = maxChars - result.length - separatorLength
            if (remaining <= 0) break

            val rendered = renderRetrievalMessage(message)
            val truncated = rendered.length > remaining
            val selected = if (truncated) {
                truncateMessage(message, remaining, keepEnd = false)
            } else {
                rendered
            }
            if (selected.isEmpty()) break

            if (result.isNotEmpty()) result.append('\n')
            result.append(selected)
            messageIds += message.id
            if (truncated) break
        }
        return FittedMessages(result.toString(), messageIds)
    }

    private fun fitMessagesFromEnd(messages: List<ChatMessageEntity>, maxChars: Int): String {
        if (maxChars <= 0) return ""
        val selected = ArrayDeque<String>()
        var remaining = maxChars
        for (message in messages.asReversed()) {
            val rendered = renderRetrievalMessage(message)
            val separatorLength = if (selected.isEmpty()) 0 else 1
            if (rendered.length + separatorLength <= remaining) {
                selected.addFirst(rendered)
                remaining -= rendered.length + separatorLength
            } else {
                val messageBudget = remaining - separatorLength
                val truncated = truncateMessage(message, messageBudget, keepEnd = true)
                if (truncated.isNotEmpty()) {
                    selected.addFirst(truncated)
                }
                break
            }
        }
        return selected.joinToString("\n")
    }

    private fun truncateMessage(message: ChatMessageEntity, maxChars: Int, keepEnd: Boolean): String {
        val prefix = message.role.name + RETRIEVAL_MESSAGE_SEPARATOR
        val contentBudget = maxChars - prefix.length - TRUNCATION_MARKER.length
        if (contentBudget < 0) return ""

        return if (keepEnd) {
            prefix + TRUNCATION_MARKER + message.content.takeLast(contentBudget)
        } else {
            prefix + message.content.take(contentBudget) + TRUNCATION_MARKER
        }
    }

    private fun renderRetrievalTranscript(messages: List<ChatMessageEntity>): String =
        messages.joinToString("\n", transform = ::renderRetrievalMessage)

    private fun retrievalTranscriptLength(messages: List<ChatMessageEntity>): Long {
        val messagesLength = messages.sumOf { message ->
            message.role.name.length.toLong() +
                    RETRIEVAL_MESSAGE_SEPARATOR.length +
                    message.content.length
        }
        val lineBreaksLength = (messages.size - 1).coerceAtLeast(0)
        return messagesLength + lineBreaksLength
    }

    private fun renderRetrievalMessage(message: ChatMessageEntity): String =
        message.role.name + RETRIEVAL_MESSAGE_SEPARATOR + message.content

    private data class FittedMessages(
        val text: String,
        val messageIds: Set<UUID>,
    )
}
