package io.uliss.note_service.controller

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.dto.ChatMessagePageResponse
import io.uliss.note_service.dto.ChatResponse
import io.uliss.note_service.dto.ChatSummaryResponse
import io.uliss.note_service.dto.SendMessageRequest
import io.uliss.note_service.dto.toChatSummaryResponse
import io.uliss.note_service.dto.toResponse
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.ChatFacade
import io.uliss.note_service.service.type.AssistantReplyStream
import io.uliss.note_service.service.type.AssistantStreamEvent
import io.uliss.security.utils.getUserId
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.codec.ServerSentEvent
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux
import java.util.UUID

@RestController
@RequestMapping("/chats")
class ChatController(
    private val chatFacade: ChatFacade,
) {

    @GetMapping
    fun getChats(@AuthenticationPrincipal jwt: Jwt): List<ChatResponse> =
        chatFacade.getChats(jwt.getUserId()).map { it.toResponse() }

    @GetMapping("/{chatId}/messages")
    fun getMessages(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @RequestParam(required = false) before: UUID?,
        @RequestParam(defaultValue = "$DEFAULT_MESSAGE_PAGE_SIZE") limit: Int,
    ): ChatMessagePageResponse {
        if (limit !in MIN_MESSAGE_PAGE_SIZE..MAX_MESSAGE_PAGE_SIZE) {
            throw BadRequestException(
                "limit must be between $MIN_MESSAGE_PAGE_SIZE and $MAX_MESSAGE_PAGE_SIZE"
            )
        }
        return chatFacade.getMessages(jwt.getUserId(), chatId, before, limit).toResponse()
    }

    @PostMapping(produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamInitialMessage(
        @AuthenticationPrincipal jwt: Jwt,
        @RequestHeader(name = IDEMPOTENCY_KEY_HEADER) idempotencyKeyHeader: String,
        @Valid @RequestBody request: SendMessageRequest,
    ): ResponseEntity<Flux<ServerSentEvent<String>>> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val reply = chatFacade.streamInitialMessage(jwt.getUserId(), idempotencyKey, request.content)
        return streamResponse(reply, idempotencyKey)
    }

    @PostMapping("/{chatId}/messages", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamMessage(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @RequestHeader(name = IDEMPOTENCY_KEY_HEADER) idempotencyKeyHeader: String,
        @Valid @RequestBody request: SendMessageRequest,
    ): ResponseEntity<Flux<ServerSentEvent<String>>> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val reply = chatFacade.streamMessage(jwt.getUserId(), chatId, idempotencyKey, request.content)
        return streamResponse(reply, idempotencyKey)
    }

    private fun streamResponse(
        reply: AssistantReplyStream,
        idempotencyKey: UUID,
    ): ResponseEntity<Flux<ServerSentEvent<String>>> {
        val stream = reply.events
            .map(::toServerSentEvent)
            .onErrorResume {
                Flux.just(ServerSentEvent.builder("FAILED").event("error").build())
            }
        val response = ResponseEntity.ok()
            .header(IDEMPOTENCY_KEY_HEADER, idempotencyKey.toString())
            .header(CHAT_TURN_ID_HEADER, reply.turnId.toString())
        reply.chatId?.let { response.header(CHAT_ID_HEADER, it.toString()) }
        return response
            .contentType(MediaType.TEXT_EVENT_STREAM)
            .body(stream)
    }

    @PostMapping("/{chatId}/turns/{turnId}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun cancelTurn(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @PathVariable turnId: UUID,
    ) {
        chatFacade.cancelTurn(jwt.getUserId(), chatId, turnId)
    }

    @PostMapping("/{chatId}/summarize")
    fun summarizeChat(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @RequestHeader(name = IDEMPOTENCY_KEY_HEADER) idempotencyKeyHeader: String,
    ): ResponseEntity<ChatSummaryResponse> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val note = chatFacade.requestSummary(jwt.getUserId(), chatId, idempotencyKey)
        return ResponseEntity.accepted()
            .header(IDEMPOTENCY_KEY_HEADER, idempotencyKey.toString())
            .body(note.toChatSummaryResponse(chatId).copy(status = NoteStatus.GENERATING))
    }

    private fun parseIdempotencyKey(value: String): UUID {
        return try {
            UUID.fromString(value)
        } catch (_: IllegalArgumentException) {
            throw BadRequestException("invalid $IDEMPOTENCY_KEY_HEADER header")
        }
    }

    private fun toServerSentEvent(event: AssistantStreamEvent): ServerSentEvent<String> = when (event) {
        is AssistantStreamEvent.AppendText -> ServerSentEvent.builder(event.text).event("append").build()
        is AssistantStreamEvent.GenerationPending ->
            ServerSentEvent.builder(event.retryAfterMs.toString()).event("pending").build()

        AssistantStreamEvent.GenerationCompleted -> ServerSentEvent.builder("").event("done").build()
        is AssistantStreamEvent.GenerationFailed ->
            ServerSentEvent.builder(event.status.name).event("error").build()
    }

    private companion object {
        const val IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"
        const val CHAT_ID_HEADER = "Chat-Id"
        const val CHAT_TURN_ID_HEADER = "Chat-Turn-Id"
        const val DEFAULT_MESSAGE_PAGE_SIZE = 50
        const val MIN_MESSAGE_PAGE_SIZE = 1
        const val MAX_MESSAGE_PAGE_SIZE = 100
    }
}
