package io.uliss.note_service.controller

import io.uliss.exception.common.BadRequestException
import io.uliss.note_service.dto.internal.AssistantStreamEvent
import io.uliss.note_service.dto.request.RenameRequest
import io.uliss.note_service.dto.request.SendMessageRequest
import io.uliss.note_service.dto.request.SummarizeRequest
import io.uliss.note_service.dto.response.AssistantTextChunkResponse
import io.uliss.note_service.dto.response.ChatMessagePageResponse
import io.uliss.note_service.dto.response.ChatResponse
import io.uliss.note_service.dto.response.ChatSummaryResponse
import io.uliss.note_service.dto.response.NoteResponse
import io.uliss.note_service.dto.response.toChatSummaryResponse
import io.uliss.note_service.dto.response.toResponse
import io.uliss.note_service.model.NoteStatus
import io.uliss.note_service.model.SummaryMode
import io.uliss.note_service.service.facade.ChatFacade
import io.uliss.note_service.service.output.AssistantReplyStream
import io.uliss.security.utils.getUserId
import jakarta.validation.Valid
import io.uliss.note_service.util.withHeartbeat
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.codec.ServerSentEvent
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux
import java.time.Duration
import java.util.UUID

@RestController
@RequestMapping("/chats")
class ChatController(
    private val chatFacade: ChatFacade,
    @param:Value($$"${note.sse.heartbeat-interval:15s}") private val heartbeatInterval: Duration,
) {

    @GetMapping
    fun getChats(@AuthenticationPrincipal jwt: Jwt): List<ChatResponse> =
        chatFacade.getChats(jwt.getUserId()).map { it.toResponse() }

    @GetMapping("/{chatId}")
    fun getChat(@AuthenticationPrincipal jwt: Jwt, @PathVariable chatId: UUID): ChatResponse =
        chatFacade.getChat(jwt.getUserId(), chatId).toResponse()

    @GetMapping("/{chatId}/notes")
    fun getChatNotes(@AuthenticationPrincipal jwt: Jwt, @PathVariable chatId: UUID): List<NoteResponse> =
        chatFacade.getChatNotes(jwt.getUserId(), chatId)

    @PatchMapping("/{chatId}")
    fun renameChat(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @Valid @RequestBody request: RenameRequest,
    ): ChatResponse = chatFacade.renameChat(jwt.getUserId(), chatId, request.title).toResponse()

    @DeleteMapping("/{chatId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteChat(@AuthenticationPrincipal jwt: Jwt, @PathVariable chatId: UUID) {
        chatFacade.deleteChat(jwt.getUserId(), chatId)
    }

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
    ): ResponseEntity<Flux<ServerSentEvent<Any>>> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val reply = chatFacade.streamReply(jwt.getUserId(), null, idempotencyKey, request.content)
        return streamResponse(reply, idempotencyKey)
    }

    @PostMapping("/{chatId}/messages", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamMessage(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @RequestHeader(name = IDEMPOTENCY_KEY_HEADER) idempotencyKeyHeader: String,
        @Valid @RequestBody request: SendMessageRequest,
    ): ResponseEntity<Flux<ServerSentEvent<Any>>> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val reply = chatFacade.streamReply(jwt.getUserId(), chatId, idempotencyKey, request.content)
        return streamResponse(reply, idempotencyKey)
    }

    /** Regenerates the chat's latest reply [messageId] when it failed or was interrupted; same SSE contract. */
    @PostMapping("/{chatId}/turns/{turnId}/retry", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun retryReply(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @PathVariable turnId: UUID,
        @RequestParam messageId: UUID,
    ): ResponseEntity<Flux<ServerSentEvent<Any>>> =
        streamResponse(chatFacade.retryReply(jwt.getUserId(), chatId, turnId, messageId), idempotencyKey = null)

    private fun streamResponse(
        reply: AssistantReplyStream,
        idempotencyKey: UUID?,
    ): ResponseEntity<Flux<ServerSentEvent<Any>>> {
        val stream = reply.events
            .map(::toServerSentEvent)
            .onErrorResume {
                Flux.just(ServerSentEvent.builder<Any>("FAILED").event("error").build())
            }
            // a notes search between model calls can stay silent longer than a proxy's read timeout
            .withHeartbeat(heartbeatInterval)
        val response = ResponseEntity.ok()
            .header(CHAT_ID_HEADER, reply.chatId.toString())
            .header(CHAT_TURN_ID_HEADER, reply.turnId.toString())
        idempotencyKey?.let { response.header(IDEMPOTENCY_KEY_HEADER, it.toString()) }
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
        @RequestBody(required = false) request: SummarizeRequest?,
    ): ResponseEntity<ChatSummaryResponse> {
        val idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader)
        val summarize = request ?: SummarizeRequest()
        val note = chatFacade.requestSummary(
            jwt.getUserId(), chatId, idempotencyKey, summarize.mode, summarize.targetNoteId, summarize.constellationId,
            summarize.parentNoteId, summarize.title, summarize.icon,
        )
        val response = note.toChatSummaryResponse(chatId)
        // A replayed create may already be READY; the client tracks it from GENERATING.
        val body = if (summarize.mode == SummaryMode.CREATE) response.copy(status = NoteStatus.GENERATING) else response
        return ResponseEntity.accepted()
            .header(IDEMPOTENCY_KEY_HEADER, idempotencyKey.toString())
            .body(body)
    }

    private fun parseIdempotencyKey(value: String): UUID {
        return try {
            UUID.fromString(value)
        } catch (_: IllegalArgumentException) {
            throw BadRequestException("invalid $IDEMPOTENCY_KEY_HEADER header")
        }
    }

    private fun toServerSentEvent(event: AssistantStreamEvent): ServerSentEvent<Any> = when (event) {
        is AssistantStreamEvent.AppendText ->
            ServerSentEvent.builder<Any>(AssistantTextChunkResponse(event.text)).event("append").build()

        is AssistantStreamEvent.Activity ->
            ServerSentEvent.builder<Any>(event.activity.name).event("activity").build()

        is AssistantStreamEvent.GenerationPending ->
            ServerSentEvent.builder<Any>(event.retryAfterMs.toString()).event("pending").build()

        AssistantStreamEvent.GenerationCompleted -> ServerSentEvent.builder<Any>("").event("done").build()
        is AssistantStreamEvent.GenerationFailed ->
            ServerSentEvent.builder<Any>(event.status.name).event("error").build()
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
