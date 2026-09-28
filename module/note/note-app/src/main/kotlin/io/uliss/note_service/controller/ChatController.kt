package io.uliss.note_service.controller

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.dto.ChatMessageResponse
import io.uliss.note_service.dto.ChatResponse
import io.uliss.note_service.dto.ChatSummaryResponse
import io.uliss.note_service.dto.CreateChatRequest
import io.uliss.note_service.dto.SendMessageRequest
import io.uliss.note_service.dto.toChatSummaryResponse
import io.uliss.note_service.dto.toResponse
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.service.ChatFacade
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
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux
import java.util.UUID

@RestController
@RequestMapping("/chats")
class ChatController(
    private val chatFacade: ChatFacade,
) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun createChat(@AuthenticationPrincipal jwt: Jwt, @Valid @RequestBody request: CreateChatRequest): ChatResponse =
        chatFacade.createChat(jwt.getUserId(), request.title).toResponse()

    @GetMapping
    fun getChats(@AuthenticationPrincipal jwt: Jwt): List<ChatResponse> =
        chatFacade.getChats(jwt.getUserId()).map { it.toResponse() }

    @GetMapping("/{chatId}/messages")
    fun getMessages(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
    ): List<ChatMessageResponse> =
        chatFacade.getMessages(jwt.getUserId(), chatId).map { it.toResponse() }

    @PostMapping("/{chatId}/messages/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamMessage(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @RequestHeader(name = IDEMPOTENCY_KEY_HEADER) idempotencyKeyHeader: String,
        @Valid @RequestBody request: SendMessageRequest,
    ): ResponseEntity<Flux<ServerSentEvent<String>>> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val reply = chatFacade.streamMessage(jwt.getUserId(), chatId, idempotencyKey, request.content)
        val stream = reply.events
            .map(::toServerSentEvent)
            .onErrorResume {
                Flux.just(ServerSentEvent.builder("FAILED").event("error").build())
            }
        return ResponseEntity.ok()
            .header(IDEMPOTENCY_KEY_HEADER, idempotencyKey.toString())
            .header(CHAT_TURN_ID_HEADER, reply.turnId.toString())
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
        const val CHAT_TURN_ID_HEADER = "Chat-Turn-Id"
    }
}
