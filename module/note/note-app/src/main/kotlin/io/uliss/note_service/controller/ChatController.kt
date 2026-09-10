package io.uliss.note_service.controller

import io.uliss.note_service.dto.ChatMessageResponse
import io.uliss.note_service.dto.ChatResponse
import io.uliss.note_service.dto.ChatSummaryResponse
import io.uliss.note_service.dto.CreateChatRequest
import io.uliss.note_service.dto.SendMessageRequest
import io.uliss.note_service.dto.toChatSummaryResponse
import io.uliss.note_service.dto.toResponse
import io.uliss.note_service.service.ChatFacade
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
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.util.UriComponentsBuilder
import reactor.core.publisher.Flux
import reactor.core.publisher.Mono
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

    @PostMapping("/{chatId}/messages")
    fun sendMessage(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @Valid @RequestBody request: SendMessageRequest,
    ): ChatMessageResponse =
        chatFacade.sendMessage(jwt.getUserId(), chatId, request.content).toResponse()

    @PostMapping("/{chatId}/messages/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamMessage(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
        @Valid @RequestBody request: SendMessageRequest,
    ): Flux<ServerSentEvent<String>> =
        chatFacade.streamMessage(jwt.getUserId(), chatId, request.content)
            .map { token -> ServerSentEvent.builder(token).event("token").build() }
            .concatWith(Mono.just(ServerSentEvent.builder("").event("done").build()))
            .onErrorResume { Flux.just(ServerSentEvent.builder("stream failed").event("error").build()) }

    @PostMapping("/{chatId}/summarize")
    fun summarizeChat(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable chatId: UUID,
    ): ResponseEntity<ChatSummaryResponse> {
        val note = chatFacade.requestSummary(jwt.getUserId(), chatId)
        val location = UriComponentsBuilder.fromPath("/note/notes")
            .pathSegment(note.id.toString())
            .build()
            .toUri()
        return ResponseEntity.accepted()
            .location(location)
            .body(note.toChatSummaryResponse(chatId))
    }
}
