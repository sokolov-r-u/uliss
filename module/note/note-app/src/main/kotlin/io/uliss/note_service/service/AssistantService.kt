package io.uliss.note_service.service

import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatMessageStatus
import io.uliss.note_service.prompt.ChatPrompts
import org.slf4j.LoggerFactory
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.messages.UserMessage
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.publisher.SignalType
import reactor.core.scheduler.Schedulers
import java.util.UUID

@Service
class AssistantService(
    private val chatClient: ChatClient,
    private val chatService: ChatService,
) {
    private val log = LoggerFactory.getLogger(AssistantService::class.java)

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
        val buffer = StringBuilder()
        return chatClient.prompt()
            .system(ChatPrompts.CHAT_SYSTEM_PROMPT)
            .messages(toAiMessages(history))
            .stream()
            .content()
            .doOnNext(buffer::append)
            // Attached to the raw content stream (before any SSE framing/onErrorResume downstream in
            // the controller) so the SignalType here always reflects the true termination cause.
            .doFinally { signal ->
                val status = when {
                    signal == SignalType.ON_COMPLETE -> ChatMessageStatus.COMPLETE
                    buffer.isNotEmpty() -> ChatMessageStatus.PARTIAL
                    else -> ChatMessageStatus.FAILED
                }
                // doFinally runs on the Reactor Netty event-loop thread of the WebClient call to
                // DeepSeek - hop off it before the blocking JPA write.
                Mono.fromRunnable<Unit> { chatService.persistAssistantReply(chatId, buffer.toString(), status) }
                    .subscribeOn(Schedulers.boundedElastic())
                    .subscribe({}, { ex -> log.error("failed to persist assistant reply for chat=$chatId", ex) })
            }
    }

    private fun toAiMessages(history: List<ChatMessageEntity>): List<Message> = history.map {
        when (it.role) {
            ChatMessageRole.USER -> UserMessage(it.content)
            ChatMessageRole.ASSISTANT -> AssistantMessage(it.content)
        }
    }
}
