package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.prompt.ChatPrompts
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.messages.UserMessage
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.scheduler.Schedulers
import java.util.UUID

@Service
class AssistantService(
    private val chatClient: ChatClient,
    private val chatService: ChatService,
) {
    private val log = AppLogger.of(AssistantService::class)

    fun reply(userId: UUID, chatId: UUID, prompt: String): ChatMessageEntity {
        val history = chatService.appendUserMessage(userId, chatId, prompt)
        val content = try {
            chatClient.prompt()
                .system(ChatPrompts.CHAT_SYSTEM_PROMPT)
                .messages(toAiMessages(history))
                .call()
                .content() ?: ""
        } catch (ex: Exception) {
            // Symmetric with streamReply's FAILED case: a call that never produced content still
            // leaves a record in history, instead of silently vanishing.
            chatService.persistAssistantReply(chatId, "", ChatMessageStatus.FAILED)
            throw ex
        }
        return chatService.persistAssistantReply(chatId, content, ChatMessageStatus.COMPLETE)
    }

    fun streamReply(userId: UUID, chatId: UUID, prompt: String): Flux<String> {
        val history = chatService.appendUserMessage(userId, chatId, prompt)
        val content = chatClient.prompt()
            .system(ChatPrompts.CHAT_SYSTEM_PROMPT)
            .messages(toAiMessages(history))
            .stream()
            .content()

        // Async cleanup delays the terminal signal, so the controller cannot append `done` until
        // the reply is durable. Cancellation follows the same off-event-loop persistence path.
        return Flux.usingWhen(
            Mono.fromSupplier { StringBuilder() },
            { reply -> content.doOnNext(reply::append) },
            { reply -> persistReply(chatId, reply, ChatMessageStatus.COMPLETE) },
            { reply, _ -> persistReply(chatId, reply, incompleteStatus(reply)) },
            { reply -> persistReply(chatId, reply, incompleteStatus(reply)) },
        )
    }

    private fun persistReply(
        chatId: UUID,
        content: StringBuilder,
        status: ChatMessageStatus,
    ): Mono<Void> = Mono.fromCallable {
        chatService.persistAssistantReply(chatId, content.toString(), status)
    }
        .subscribeOn(Schedulers.boundedElastic())
        .doOnError { ex ->
            log.error("failed to persist assistant reply for chat=$chatId", "persistReply", ex)
        }
        .then()

    private fun incompleteStatus(content: StringBuilder): ChatMessageStatus =
        if (content.isNotEmpty()) ChatMessageStatus.PARTIAL else ChatMessageStatus.FAILED

    private fun toAiMessages(history: List<ChatMessageEntity>): List<Message> = history.map {
        when (it.role) {
            ChatMessageRole.USER -> UserMessage(it.content)
            ChatMessageRole.ASSISTANT -> AssistantMessage(it.content)
        }
    }
}
