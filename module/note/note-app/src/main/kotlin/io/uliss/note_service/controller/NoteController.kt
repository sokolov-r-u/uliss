package io.uliss.note_service.controller

import io.uliss.note_service.dto.NoteResponse
import io.uliss.note_service.dto.NoteStatusResponse
import io.uliss.note_service.service.NoteService
import io.uliss.security.utils.getUserId
import org.springframework.http.MediaType
import org.springframework.http.codec.ServerSentEvent
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import reactor.core.publisher.Flux
import java.util.UUID

@RestController
@RequestMapping("/notes")
class NoteController(
    private val noteService: NoteService,
) {

    @GetMapping
    fun getNotes(@AuthenticationPrincipal jwt: Jwt): List<NoteResponse> =
        noteService.getNotes(jwt.getUserId())

    @GetMapping("/{noteId}")
    fun getNote(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): NoteResponse = noteService.getNote(jwt.getUserId(), noteId)

    @GetMapping("/{noteId}/status/stream", produces = [MediaType.TEXT_EVENT_STREAM_VALUE])
    fun streamNoteStatus(
        @AuthenticationPrincipal jwt: Jwt,
        @PathVariable noteId: UUID,
    ): Flux<ServerSentEvent<NoteStatusResponse>> =
        noteService.streamNoteStatus(jwt.getUserId(), noteId)
            .map { status -> ServerSentEvent.builder(status).event("status").build() }
}
