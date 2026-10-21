package io.uliss.note_service.service

import io.uliss.logging.logger.AppLogger
import io.uliss.note_service.dto.internal.AssistantActivity
import io.uliss.note_service.dto.internal.AssistantStreamEvent
import io.uliss.note_service.dto.internal.ChatTurnRequestResolution
import io.uliss.note_service.model.ChatMessageEntity
import io.uliss.note_service.model.ChatMessageRole
import io.uliss.note_service.model.projection.ChatTurnStatus
import io.uliss.note_service.service.output.AssistantReplyStream
import io.uliss.note_service.service.tool.NoteSearch
import io.uliss.note_service.service.tool.NotesSearchProperties
import io.uliss.note_service.service.tool.NotesSearchTool
import io.uliss.note_service.util.ChatPrompts
import io.uliss.note_service.util.isEmptyAssistantReply
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.messages.Message
import org.springframework.ai.chat.messages.UserMessage
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.stereotype.Service
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
import reactor.core.publisher.Sinks
import reactor.core.scheduler.Schedulers
import java.util.UUID

@Service
class AssistantService(
    private val chatClient: ChatClient,
    private val chatTurnService: ChatTurnService,
    private val properties: AssistantProperties,
    private val notesSearchProperties: NotesSearchProperties,
) {
    private val log = AppLogger.of(AssistantService::class)

    /** [noteSearch] backs the model's `searchNotes` tool; it is already bound to the user. */
    fun streamReply(
        userId: UUID,
        chatId: UUID,
        idempotencyKey: UUID,
        prompt: String,
        noteSearch: NoteSearch,
    ): AssistantReplyStream {
        return when (val resolution = chatTurnService.resolveTurnRequest(userId, chatId, idempotencyKey, prompt)) {
            is ChatTurnRequestResolution.StartGeneration ->
                AssistantReplyStream(
                    resolution.turn.id,
                    streamNewGeneration(resolution, noteSearch),
                    resolution.turn.chatId,
                )

            is ChatTurnRequestResolution.AlreadyGenerating ->
                AssistantReplyStream(
                    resolution.turn.id,
                    Flux.just(AssistantStreamEvent.GenerationPending(resolution.turn.retryAfterMs)),
                    resolution.turn.chatId,
                )

            is ChatTurnRequestResolution.AlreadyFinished ->
                AssistantReplyStream(
                    resolution.turn.id,
                    Flux.just(resolution.turn.status.toReplayEvent()),
                    resolution.turn.chatId,
                )
        }
    }

    fun cancelTurn(userId: UUID, chatId: UUID, turnId: UUID) {
        chatTurnService.cancelTurn(userId, chatId, turnId)
    }

    private fun streamNewGeneration(
        resolution: ChatTurnRequestResolution.StartGeneration,
        noteSearch: NoteSearch,
    ): Flux<AssistantStreamEvent> = Flux.defer {
        var finalized = false
        Flux.usingWhen(
            Mono.fromSupplier { StringBuilder() },
            { reply ->
                // Only the tool emits here, one call at a time on its blocking thread; text never goes through it.
                val activities = Sinks.many().unicast().onBackpressureBuffer<AssistantStreamEvent>()
                val tool = NotesSearchTool(
                    chatId = resolution.turn.chatId,
                    search = noteSearch,
                    properties = notesSearchProperties,
                    // Each search adds a model call to this attempt; the lease must cover it.
                    keepLease = { chatTurnService.extendLease(resolution.turn) },
                    onSearchStarted = {
                        activities.tryEmitNext(AssistantStreamEvent.Activity(AssistantActivity.SEARCHING_NOTES))
                    },
                    onSearchFinished = {
                        activities.tryEmitNext(AssistantStreamEvent.Activity(AssistantActivity.THINKING))
                    },
                )
                val text = streamProviderTokens(resolution.turn.chatId, resolution.history, tool)
                    .doOnNext(reply::append)
                    .map<AssistantStreamEvent> { AssistantStreamEvent.AppendText(it) }
                    .doFinally { activities.tryEmitComplete() }
                Flux.merge(activities.asFlux(), text)
            },
            { reply ->
                persistAssistantResult(resolution, reply, ChatTurnStatus.COMPLETE).doOnNext { finalized = it }
            },
            { reply, ex ->
                log.error(
                    "provider stream failed for chat=${resolution.turn.chatId} turn=${resolution.turn.id}",
                    "streamNewGeneration",
                    ex,
                )
                persistAssistantResult(resolution, reply, interruptedStatus(reply))
            },
            { reply -> persistAssistantResult(resolution, reply, interruptedStatus(reply)) },
        ).concatWith(Mono.defer { if (finalized) Mono.just(AssistantStreamEvent.GenerationCompleted) else lostFenceEvent(resolution) })
    }

    /**
     * The attempt lost its fence: the turn was canceled (e.g. from another tab) or reclaimed by a newer attempt.
     * Report what the turn is now instead of failing the stream.
     */
    private fun lostFenceEvent(resolution: ChatTurnRequestResolution.StartGeneration): Mono<AssistantStreamEvent> =
        Mono.fromCallable {
            val current = chatTurnService.getTurn(resolution.turn.userId, resolution.turn.id)
            if (current.status == ChatTurnStatus.GENERATING) {
                AssistantStreamEvent.GenerationPending(current.retryAfterMs)
            } else {
                current.status.toReplayEvent()
            }
        }.subscribeOn(Schedulers.boundedElastic())

    private fun streamProviderTokens(
        chatId: UUID,
        history: List<ChatMessageEntity>,
        notesSearchTool: NotesSearchTool,
    ): Flux<String> = Flux.defer {
        chatClient.prompt()
            .system(ChatPrompts.CHAT_SYSTEM_PROMPT)
            .messages(toAiMessages(history))
            .tools(notesSearchTool)
            .options(
                OpenAiChatOptions.builder()
                    .reasoningEffort(properties.reasoningEffort)
                    .verbosity(properties.verbosity)
                    // Routes every turn of a chat to the same prompt cache; the prefix is the growing history.
                    .promptCacheKey(chatId.toString())
            )
            .stream()
            .chatResponse()
            .doOnNext { logUsage(chatId, it) }
            .handle { response, sink -> response.result?.output?.text?.takeIf { it.isNotEmpty() }?.let(sink::next) }
    }

    /** Only the final stream chunk carries usage; earlier chunks report zero prompt tokens. */
    private fun logUsage(chatId: UUID, response: ChatResponse) {
        val usage = response.metadata.usage
        if (usage.promptTokens <= 0) return
        log.info(
            "chat=$chatId usage prompt=${usage.promptTokens} cached=${usage.cacheReadInputTokens ?: 0} " +
                    "completion=${usage.completionTokens}",
            "streamProviderTokens",
        )
    }

    /** Emits whether this attempt saved the outcome; `false` means it lost its fence before finalization. */
    private fun persistAssistantResult(
        resolution: ChatTurnRequestResolution.StartGeneration,
        content: StringBuilder,
        status: ChatTurnStatus,
    ): Mono<Boolean> = Mono.fromCallable {
        chatTurnService.finishGenerationAttempt(
            userId = resolution.turn.userId,
            chatId = resolution.turn.chatId,
            turnId = resolution.turn.id,
            attempt = resolution.turn.attempt,
            content = content.toString(),
            status = status,
        ).also { saved ->
            if (!saved) {
                log.info(
                    "chat turn id=${resolution.turn.id} attempt=${resolution.turn.attempt} lost its fence; " +
                            "$status result discarded",
                    "persistAssistantResult",
                )
            }
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

    private fun toAiMessages(history: List<ChatMessageEntity>): List<Message> = history
        .filterNot { it.isEmptyAssistantReply() }
        .map {
            when (it.role) {
                ChatMessageRole.USER -> UserMessage(it.content)
                ChatMessageRole.ASSISTANT -> AssistantMessage(it.content)
            }
        }
}
