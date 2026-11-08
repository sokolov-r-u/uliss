package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.util.ChatTitlePrompts
import io.uliss.note_service.util.TitleNormalizer
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import java.util.UUID
import java.util.concurrent.TimeoutException

/** Names a new chat from its first message with one short, non-streaming model call. */
@Service
class ChatTitleService(
    private val chatClient: ChatClient,
    private val chatService: ChatService,
    private val properties: ChatTitleProperties,
) {
    private val log = AppLogger.of(ChatTitleService::class)

    /**
     * Names the chat from its first [message] and stores the title; the returned Mono replays it, or completes empty
     * when no title was stored. The work starts on its own, after the current transaction commits (at once outside
     * one), so a client that stops listening does not stop it.
     */
    fun generateTitle(userId: UUID, chatId: UUID, message: String): Mono<String> {
        val title = requestAndStore(userId, chatId, message).cache()
        afterCommit { title.subscribe() }
        return title
    }

    private fun afterCommit(action: () -> Unit) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return action()
        TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
            override fun afterCommit() = action()
        })
    }

    private fun requestAndStore(userId: UUID, chatId: UUID, message: String): Mono<String> =
        Mono.fromCallable { findTitle(chatId, message) }
            .subscribeOn(Schedulers.boundedElastic())
            // before storing: a title that misses the stream is dropped, not written behind the user's back
            .timeout(properties.timeout)
            .onErrorResume(TimeoutException::class.java) {
                log.warn("title for chat=$chatId took over ${properties.timeout}; the first-message title stays", "generateTitle")
                Mono.empty()
            }
            .publishOn(Schedulers.boundedElastic())
            .filter { chatService.applyGeneratedTitle(userId, chatId, it) }
            .onErrorResume(RuntimeException::class.java) { ex ->
                log.warn("title for chat=$chatId was not stored; the first-message title stays", "generateTitle", ex)
                Mono.empty()
            }

    /** The model's title for the chat's first [message]; null when the call fails or yields no text. */
    fun findTitle(chatId: UUID, message: String): String? =
        try {
            requestTitle(message).also {
                if (it == null) log.warn("model gave no title for chat=$chatId; the first-message title stays", "findTitle")
            }
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
