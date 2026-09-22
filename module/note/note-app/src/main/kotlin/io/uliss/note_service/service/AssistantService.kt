package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.ChatTurnStatus
import io.uliss.note_service.prompt.ChatPrompts
import io.uliss.note_service.service.type.AssistantStreamEvent
import io.uliss.note_service.service.type.ChatTurnRequestResolution
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
    private val chatTurnService: ChatTurnService,
) {
    private val log = AppLogger.of(AssistantService::class)

    fun streamReply(userId: UUID, chatId: UUID, idempotencyKey: UUID, prompt: String): Flux<AssistantStreamEvent> =
        when (val resolution = chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, prompt)) {
            is ChatTurnRequestResolution.StartGeneration -> streamNewGeneration(resolution)
            is ChatTurnRequestResolution.AlreadyGenerating ->
                Flux.just(AssistantStreamEvent.GenerationPending(resolution.turn.retryAfterMs))

            is ChatTurnRequestResolution.AlreadyFinished -> Flux.just(resolution.turn.status.toReplayEvent())
        }

    fun cancelTurn(userId: UUID, chatId: UUID, turnId: UUID) {
        chatTurnService.cancelTurn(userId, chatId, turnId)
    }

    private fun streamNewGeneration(
        resolution: ChatTurnRequestResolution.StartGeneration,
    ): Flux<AssistantStreamEvent> {
        val providerTokens = chatClient.prompt()
            .system(ChatPrompts.CHAT_SYSTEM_PROMPT)
            .messages(toAiMessages(resolution.history))
            .stream()
            .content()

        return Flux.usingWhen(
            Mono.fromSupplier { StringBuilder() },
            { reply ->
                providerTokens
                    .doOnNext(reply::append)
                    .map<AssistantStreamEvent> { AssistantStreamEvent.AppendText(it) }
            },
            { reply -> persistAssistantResult(resolution, reply, ChatTurnStatus.COMPLETE) },
            { reply, _ -> persistAssistantResult(resolution, reply, interruptedStatus(reply)) },
            { reply -> persistAssistantResult(resolution, reply, interruptedStatus(reply)) },
        ).concatWith(Mono.just(AssistantStreamEvent.GenerationCompleted))
    }

    private fun persistAssistantResult(
        resolution: ChatTurnRequestResolution.StartGeneration,
        content: StringBuilder,
        status: ChatTurnStatus,
    ): Mono<Void> = Mono.fromCallable {
        check(
            chatTurnService.finishGenerationAttempt(
                userId = resolution.turn.userId,
                chatId = resolution.turn.chatId,
                turnId = resolution.turn.id,
                attempt = resolution.turn.attempt,
                content = content.toString(),
                status = status,
            )
        ) {
            "chat turn id=${resolution.turn.id} attempt=${resolution.turn.attempt} became stale before finalization"
        }
    }
        .subscribeOn(Schedulers.boundedElastic())
        .doOnError { ex ->
            log.error(
                "failed to persist assistant reply for chat=${resolution.turn.chatId} turn=${resolution.turn.id}",
                "persistAssistantResult",
                ex,
            )
        }
        .then()

    private fun interruptedStatus(content: StringBuilder): ChatTurnStatus =
        if (content.isNotEmpty()) ChatTurnStatus.PARTIAL else ChatTurnStatus.FAILED

    private fun ChatTurnStatus.toReplayEvent(): AssistantStreamEvent = when (this) {
        ChatTurnStatus.COMPLETE -> AssistantStreamEvent.GenerationCompleted
        ChatTurnStatus.PARTIAL,
        ChatTurnStatus.FAILED,
        ChatTurnStatus.CANCELED,
            -> AssistantStreamEvent.GenerationFailed(this)

        ChatTurnStatus.GENERATING -> error("a generating turn cannot be a terminal replay")
    }

    private fun toAiMessages(history: List<ChatMessageEntity>): List<Message> = history.map {
        when (it.role) {
            ChatMessageRole.USER -> UserMessage(it.content)
            ChatMessageRole.ASSISTANT -> AssistantMessage(it.content)
        }
    }
}
