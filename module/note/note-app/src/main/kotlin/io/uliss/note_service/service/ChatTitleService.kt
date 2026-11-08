package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.util.ChatTitlePrompts
import io.uliss.note_service.util.TitleNormalizer
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Service
import java.util.UUID

/** Names a new chat from its first message with one short, non-streaming model call. */
@Service
class ChatTitleService(
    private val chatClient: ChatClient,
    private val properties: ChatTitleProperties,
) {
    private val log = AppLogger.of(ChatTitleService::class)

    /** The model's title for the chat's first [message]; null when the call fails or yields no text. */
    fun findTitle(chatId: UUID, message: String): String? =
        try {
            requestTitle(message)
        } catch (ex: RuntimeException) {
            log.warn("title generation failed for chat=$chatId; the first-message title stays", "findTitle", ex)
            null
        }

    private fun requestTitle(message: String): String? =
        chatClient.prompt()
            .system(ChatTitlePrompts.SYSTEM_PROMPT)
            .user(head(message))
            .options(
                OpenAiChatOptions.builder()
                    .reasoningEffort(properties.reasoningEffort)
                    .verbosity(properties.verbosity)
            )
            .call()
            .content()
            .let(TitleNormalizer::normalizeModelTitle)

    /** The first [ChatTitleProperties.maxInputChars] code points: a title needs only the start of the message. */
    private fun head(message: String): String {
        if (message.codePointCount(0, message.length) <= properties.maxInputChars) return message
        return message.substring(0, message.offsetByCodePoints(0, properties.maxInputChars))
    }
}
